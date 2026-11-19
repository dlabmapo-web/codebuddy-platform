'use client';

import {
  decodeFileBundle,
  encodeFileBundle,
  isCompiledSource,
  parseGccDiagnostics,
  sourceExtensionsFor,
  sourcePathError,
  type BundleFile,
  type CompiledLanguage,
  type LearnerProject,
} from '@cove/shared';
import type { OnMount } from '@monaco-editor/react';
import { FileCode2, FolderOpen, Lock, MoreVertical, Plus, RotateCcw, Upload, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import * as React from 'react';

import { useLayoutTranslation } from '@/i18n';
import { EDITOR_FONT_FAMILY, registerPaircodeTheme } from '@/lib/monaco/theme';
import type { BundleHost } from '@/lib/monitoring/yjs-bundle';
import type { MonacoCodeEditor } from '@/lib/monitoring/yjs-monaco';

const MonacoEditor = dynamic(() => import('@/lib/monaco/editor'), { ssr: false });

type Monaco = Parameters<OnMount>[1];
type TextModel = NonNullable<ReturnType<MonacoCodeEditor['getModel']>>;

/**
 * A multi-file C/C++ program in one editor: tabs, a file list, and one Monaco
 * model per file.
 *
 * The program travels as a file bundle (`encodeFileBundle`) everywhere outside
 * this component; inside, every file is its own model, so each keeps its undo
 * history, caret and scroll position across tab switches. Every edit, and
 * every new, renamed or deleted file, is reported as the whole new bundle.
 *
 * Three uses, one component:
 * - a learner's workspace (`project` given, `onChange` given): the author's
 *   read-only files cannot be edited, renamed or deleted; the learner may add,
 *   rename and delete their own; files the build skips are marked;
 * - a shared live document (`onMount` hands out a `BundleHost` for
 *   `bindYTextToBundle`), on the student's side and the teacher's;
 * - a read-only viewer (no `onChange`): history, review, solutions.
 */
export function MultiFileEditor({
  code,
  onChange,
  language,
  project,
  fontSize,
  readOnly = false,
  documentManaged = false,
  diagnostics,
  starterCode,
  onMount,
  theme = 'paircode-dark',
  initialActive,
}: {
  /** The program as a file bundle. */
  code: string;
  /** Absent makes the editor a viewer. */
  onChange?: (bundle: string) => void;
  language: CompiledLanguage;
  /** The learner's rules; absent treats every file as an editable author file. */
  project?: LearnerProject | null;
  fontSize: number;
  readOnly?: boolean;
  /** A collaboration binding owns the files; `code` follows rather than leads. */
  documentManaged?: boolean;
  /** GCC's messages from the latest compile, marked in the file they name. */
  diagnostics?: string | null;
  /** The starting bundle, for resetting one file. */
  starterCode?: string;
  onMount?: (editor: MonacoCodeEditor, host: BundleHost) => void;
  theme?: 'paircode-dark' | 'light';
  initialActive?: string;
}) {
  const { t } = useLayoutTranslation('common');
  const editable = Boolean(onChange) && !readOnly;
  const initialFiles = React.useMemo(() => decodeFileBundle(code) ?? [{ path: 'main.c', content: code }], []); // eslint-disable-line react-hooks/exhaustive-deps
  const [paths, setPaths] = React.useState<string[]>(() => initialFiles.map((file) => file.path));
  const authorFiles = React.useMemo(() => new Map((project?.files ?? []).map((file) => [file.path, file])), [project]);
  const opening = React.useMemo(() => {
    const preferred = project
      ? project.files.filter((file) => file.openByDefault).map((file) => file.path)
      : initialFiles.map((file) => file.path);
    const existing = preferred.filter((path) => paths.includes(path));
    return existing.length ? existing : paths.slice(0, 1);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [tabs, setTabs] = React.useState<string[]>(opening);
  const [active, setActive] = React.useState<string>(
    initialActive && paths.includes(initialActive) ? initialActive : (opening[0] ?? paths[0] ?? ''),
  );
  const treeMode = project?.fileTree ?? 'OPEN';
  const [explorerOpen, setExplorerOpen] = React.useState(treeMode === 'OPEN');
  const [naming, setNaming] = React.useState<{ from: string | null; value: string } | null>(null);
  const [menu, setMenu] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState<{ kind: 'delete' | 'reset'; path: string } | null>(null);

  const monacoRef = React.useRef<Monaco | null>(null);
  const editorRef = React.useRef<MonacoCodeEditor | null>(null);
  const models = React.useRef(new Map<string, TextModel>());
  const viewStates = React.useRef(new Map<string, unknown>());
  const pathsRef = React.useRef(paths);
  const activeRef = React.useRef(active);
  const applying = React.useRef(false);
  const listeners = React.useRef(new Set<() => void>());
  const lastEmitted = React.useRef(code);
  const latestCode = React.useRef(code);
  const scope = React.useId().replace(/:/g, '');
  const onChangeRef = React.useRef(onChange);
  // Read by Monaco's callbacks, which outlive any one render.
  React.useLayoutEffect(() => {
    activeRef.current = active;
    pathsRef.current = paths;
    latestCode.current = code;
    onChangeRef.current = onChange;
  });

  const monacoLanguage = language === 'C' ? 'c' : 'cpp';
  const uriFor = (path: string) => monacoRef.current!.Uri.parse(`inmemory://cove-files/${scope}/${path}`);

  /** The editor's files as a bundle, in list order. */
  const read = React.useCallback(
    () => encodeFileBundle(pathsRef.current.map((path) => ({ path, content: models.current.get(path)?.getValue(1) ?? '' }))),
    [],
  );

  const emit = React.useCallback(() => {
    const bundle = read();
    lastEmitted.current = bundle;
    onChangeRef.current?.(bundle);
    for (const listener of listeners.current) listener();
  }, [read]);

  const createModel = React.useCallback((path: string, content: string) => {
    const monaco = monacoRef.current!;
    const model = monaco.editor.createModel(content, monacoLanguage, uriFor(path));
    model.setEOL(monaco.editor.EndOfLineSequence.LF);
    model.onDidChangeContent((event: { isEolChange: boolean }) => {
      if (applying.current || event.isEolChange) return;
      emit();
    });
    models.current.set(path, model);
    return model;
  }, [emit, monacoLanguage]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Make the files equal a bundle, each model by its smallest edit. Not reported. */
  const apply = React.useCallback((bundle: string) => {
    if (!monacoRef.current) return;
    const files: BundleFile[] = decodeFileBundle(bundle) ?? [];
    applying.current = true;
    try {
      const next = new Set(files.map((file) => file.path));
      for (const [path, model] of models.current) {
        if (!next.has(path)) {
          model.dispose();
          models.current.delete(path);
        }
      }
      for (const file of files) {
        const model = models.current.get(file.path);
        if (!model) createModel(file.path, file.content);
        else replaceMinimally(model, file.content);
      }
    } finally {
      applying.current = false;
    }
    lastEmitted.current = bundle;
    const order = files.map((file) => file.path);
    pathsRef.current = order;
    setPaths(order);
    setTabs((current) => {
      const kept = current.filter((path) => order.includes(path));
      return kept.length ? kept : order.slice(0, 1);
    });
    setActive((current) => (order.includes(current) ? current : (order[0] ?? '')));
  }, [createModel]);

  /** The file a peer's live pointer is in, when it is not the one on screen. */
  const [peerFile, setPeerFile] = React.useState<string | null>(null);
  const host = React.useMemo<BundleHost>(() => ({
    read,
    apply,
    onLocalChange: (listener) => {
      listeners.current.add(listener);
      return { dispose: () => listeners.current.delete(listener) };
    },
    pointer: () => editorRef.current ? {
      editor: editorRef.current,
      activePath: () => activeRef.current || null,
      // Projection runs on every frame the pointer moves: set only on change.
      showPeerFile: (path) => setPeerFile((current) => (current === path ? current : path)),
    } : null,
  }), [apply, read]);

  const handleMount: OnMount = (editor, monaco) => {
    monacoRef.current = monaco;
    editorRef.current = editor;
    const files = decodeFileBundle(latestCode.current) ?? initialFiles;
    for (const file of files) createModel(file.path, file.content);
    lastEmitted.current = latestCode.current;
    pathsRef.current = files.map((file) => file.path);
    setPaths(pathsRef.current);
    const first = models.current.get(active) ?? models.current.values().next().value;
    if (first) editor.setModel(first);
    onMount?.(editor, host);
  };

  // Dispose every model this editor created, and only those.
  React.useEffect(() => () => {
    for (const model of models.current.values()) model.dispose();
    models.current.clear();
  }, []);

  // A new value from outside (reset, restore, a reviewed attempt) when no
  // binding owns the files. While one does, `code` merely follows the models.
  React.useEffect(() => {
    if (documentManaged || !monacoRef.current) return;
    if (code === lastEmitted.current || code === read()) return;
    apply(code);
  }, [apply, code, documentManaged, read]);

  // Switch the editor to the active file's model, keeping each file's view.
  const shown = React.useRef<string | null>(null);
  React.useEffect(() => {
    const editor = editorRef.current;
    const model = models.current.get(active);
    if (!editor || !model || shown.current === active) return;
    if (shown.current) viewStates.current.set(shown.current, editor.saveViewState());
    editor.setModel(model);
    const state = viewStates.current.get(active);
    if (state) editor.restoreViewState(state as Parameters<MonacoCodeEditor['restoreViewState']>[0]);
    shown.current = active;
  });

  const activeAuthor = authorFiles.get(active);
  const activeReadOnly = !editable || Boolean(activeAuthor?.readOnly);
  React.useEffect(() => {
    editorRef.current?.updateOptions({ readOnly: activeReadOnly });
  }, [activeReadOnly, active]);

  // GCC's messages, for the file on screen; the tab of any other file says it has some.
  const marks = React.useMemo(
    () => (diagnostics ? parseGccDiagnostics(diagnostics).filter((item) => item.severity !== 'note') : []),
    [diagnostics],
  );
  const decorations = React.useRef<string[]>([]);
  React.useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) return;
    const lineCount = model.getLineCount();
    decorations.current = editor.deltaDecorations(
      decorations.current,
      marks.filter((item) => item.file === active).map((item) => {
        const line = Math.min(Math.max(1, item.line), lineCount);
        const error = item.severity === 'error';
        return {
          range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
          options: {
            isWholeLine: true,
            className: error ? 'cove-error-line' : 'cove-warning-line',
            glyphMarginClassName: error ? 'cove-error-glyph' : 'cove-warning-glyph',
            glyphMarginHoverMessage: { value: `${item.line}:${item.column} ${item.message}` },
          },
        };
      }),
    );
  }, [marks, active, paths]);
  const filesWithErrors = new Set(marks.filter((item) => item.severity === 'error').map((item) => item.file));

  const isOwn = (path: string) => Boolean(project) && !authorFiles.has(path);
  const compiled = (path: string) => {
    const author = authorFiles.get(path);
    if (author) return author.compiled;
    return project ? project.includeLearnerSources && isCompiledSource(path, language) : isCompiledSource(path, language);
  };
  const showsNotCompiled = (path: string) => Boolean(project) && isCompiledSource(path, language) && !compiled(path);
  const canManageFiles = editable && Boolean(project) && treeMode !== 'DISABLED';

  const open = (path: string) => {
    setTabs((current) => (current.includes(path) ? current : [...current, path]));
    setActive(path);
  };
  const closeTab = (path: string) => {
    setTabs((current) => {
      const next = current.filter((tab) => tab !== path);
      if (path === active) setActive(next[next.length - 1] ?? '');
      return next;
    });
  };

  const nameError = (name: string, from: string | null): string | null => {
    const error = sourcePathError(name, language);
    if (error) return t('source_files.error_invalid', { extensions: sourceExtensionsFor(language).join(' ') });
    const key = name.toLowerCase();
    if (paths.some((path) => path !== from && path.toLowerCase() === key)) return t('source_files.error_duplicate');
    return null;
  };
  const commitName = () => {
    if (!naming) return;
    const name = naming.value.trim();
    if (!name || nameError(name, naming.from)) return;
    if (naming.from === null) {
      createModel(name, '');
      pathsRef.current = [...pathsRef.current, name];
      setPaths(pathsRef.current);
      emit();
      open(name);
    } else if (name !== naming.from) {
      const from = naming.from;
      const old = models.current.get(from);
      const content = old?.getValue(1) ?? '';
      old?.dispose();
      models.current.delete(from);
      createModel(name, content);
      pathsRef.current = pathsRef.current.map((path) => (path === from ? name : path));
      setPaths(pathsRef.current);
      setTabs((current) => current.map((tab) => (tab === from ? name : tab)));
      if (active === from) {
        shown.current = null;
        setActive(name);
      }
      emit();
    }
    setNaming(null);
  };
  const deleteFile = (path: string) => {
    models.current.get(path)?.dispose();
    models.current.delete(path);
    pathsRef.current = pathsRef.current.filter((item) => item !== path);
    setPaths(pathsRef.current);
    closeTab(path);
    emit();
  };
  const resetFile = (path: string) => {
    const starter = decodeFileBundle(starterCode ?? '')?.find((file) => file.path === path);
    const model = models.current.get(path);
    if (!starter || !model) return;
    // An ordinary edit, so undo can bring the work back and a live peer follows.
    replaceMinimally(model, starter.content);
  };
  /** Local text files as the learner's own, each checked like a typed name. */
  const [uploadNote, setUploadNote] = React.useState<string | null>(null);
  const uploadFiles = async (files: File[]) => {
    const skipped: string[] = [];
    let added = 0;
    for (const file of files) {
      const name = file.name;
      if (nameError(name, null) || pathsRef.current.includes(name) || file.size > 100_000) { skipped.push(name); continue; }
      createModel(name, (await file.text()).replace(/\r\n?/g, '\n'));
      pathsRef.current = [...pathsRef.current, name];
      added += 1;
    }
    if (added) {
      setPaths(pathsRef.current);
      emit();
      open(pathsRef.current[pathsRef.current.length - 1]!);
    }
    setUploadNote(skipped.length ? t('source_files.upload_skipped', { names: skipped.join(', ') }) : null);
  };
  const canReset = editable && Boolean(starterCode) && Boolean(activeAuthor) && !activeAuthor?.readOnly;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-editor-bg text-[12px] text-white/80">
      <div className="flex shrink-0 items-center border-b border-white/10 bg-[#252526]" role="tablist">
        {treeMode !== 'DISABLED' ? (
          <button
            type="button"
            aria-label={explorerOpen ? t('source_files.hide_files') : t('source_files.show_files')}
            aria-pressed={explorerOpen}
            title={t('source_files.files')}
            onClick={() => setExplorerOpen((value) => !value)}
            className="flex h-8 w-9 shrink-0 items-center justify-center border-r border-white/10 hover:bg-white/10"
          >
            <FolderOpen className="size-4" />
          </button>
        ) : null}
        <div className="flex min-w-0 flex-1 overflow-x-auto">
          {tabs.map((path) => (
            <div
              key={path}
              className={`group flex shrink-0 items-center gap-1 border-r border-white/10 pl-3 pr-1 ${path === active ? 'bg-editor-bg text-white' : 'text-white/60 hover:bg-white/5'}`}
            >
              <button type="button" role="tab" aria-selected={path === active} onClick={() => setActive(path)} className="flex h-8 items-center gap-1.5">
                <FileIcon path={path} />
                <span>{path}</span>
                {filesWithErrors.has(path) ? <span aria-label={t('source_files.has_errors')} className="size-1.5 rounded-full bg-red-400" /> : null}
                {peerFile === path && path !== active ? <span aria-label={t('source_files.peer_here')} title={t('source_files.peer_here')} className="size-2 animate-pulse rounded-full bg-brand" /> : null}
                {authorFiles.get(path)?.readOnly ? <Lock aria-label={t('source_files.read_only')} className="size-3 opacity-60" /> : null}
              </button>
              <button type="button" aria-label={t('source_files.close_tab', { path })} onClick={() => closeTab(path)} className="rounded p-0.5 opacity-50 hover:bg-white/10 hover:opacity-100">
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
        {canReset ? (
          <button type="button" title={t('source_files.reset_file')} aria-label={t('source_files.reset_file')} onClick={() => setConfirm({ kind: 'reset', path: active })} className="flex h-8 w-9 shrink-0 items-center justify-center hover:bg-white/10">
            <RotateCcw className="size-3.5" />
          </button>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1">
        {explorerOpen && treeMode !== 'DISABLED' ? (
          <nav aria-label={t('source_files.files')} className="flex w-44 shrink-0 flex-col overflow-y-auto border-r border-white/10 bg-[#1e1e1e]">
            <div className="flex items-center justify-between px-2 py-1.5 text-[11px] uppercase tracking-wide text-white/50">
              <span>{t('source_files.files')}</span>
              {canManageFiles ? (
                <span className="flex items-center gap-0.5">
                  <button type="button" aria-label={t('source_files.new_file')} title={t('source_files.new_file')} onClick={() => setNaming({ from: null, value: '' })} className="rounded p-0.5 hover:bg-white/10">
                    <Plus className="size-3.5" />
                  </button>
                  <label aria-label={t('source_files.upload')} title={t('source_files.upload')} className="cursor-pointer rounded p-0.5 hover:bg-white/10">
                    <Upload className="size-3.5" />
                    <input type="file" multiple className="sr-only" accept={sourceExtensionsFor(language).join(',')} onChange={(event) => {
                      void uploadFiles(Array.from(event.target.files ?? []));
                      event.target.value = '';
                    }} />
                  </label>
                </span>
              ) : null}
            </div>
            {uploadNote ? <p role="alert" className="px-2 pb-1 text-[10px] leading-tight text-amber-300">{uploadNote}</p> : null}
            <ul>
              {paths.map((path, index) => (
                <React.Fragment key={path}>
                {folderOf(path) && folderOf(path) !== folderOf(paths[index - 1] ?? '') ? (
                  <li aria-hidden className="px-2 pt-1 text-[11px] text-white/45">{folderOf(path)}/</li>
                ) : null}
                <li className={`group relative flex items-center ${folderOf(path) ? 'pl-3' : ''} ${path === active ? 'bg-white/10 text-white' : 'hover:bg-white/5'}`}>
                  {naming?.from === path ? (
                    <NameInput naming={naming} setNaming={setNaming} commit={commitName} error={nameError(naming.value.trim(), path)} />
                  ) : (
                    <button type="button" onClick={() => open(path)} className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1 text-left" title={showsNotCompiled(path) ? t('source_files.not_compiled_hint') : path}>
                      <FileIcon path={path} />
                      <span className="truncate">{path}</span>
                      {authorFiles.get(path)?.readOnly ? <Lock className="size-3 shrink-0 opacity-60" /> : null}
                      {showsNotCompiled(path) ? <span className="ml-auto shrink-0 rounded bg-amber-400/15 px-1 text-[10px] text-amber-300">{t('source_files.not_compiled')}</span> : null}
                    </button>
                  )}
                  {canManageFiles && isOwn(path) && naming?.from !== path ? (
                    <button type="button" aria-label={`${path} ⋮`} onClick={() => setMenu(menu === path ? null : path)} className="mr-1 rounded p-0.5 opacity-60 hover:bg-white/10 hover:opacity-100">
                      <MoreVertical className="size-3.5" />
                    </button>
                  ) : null}
                  {menu === path ? (
                    <div role="menu" className="absolute right-1 top-full z-20 w-28 rounded border border-white/10 bg-[#2d2d2d] py-1 shadow-lg">
                      <button type="button" role="menuitem" className="block w-full px-3 py-1 text-left hover:bg-white/10" onClick={() => { setMenu(null); setNaming({ from: path, value: path }); }}>{t('source_files.rename')}</button>
                      <button type="button" role="menuitem" className="block w-full px-3 py-1 text-left text-red-300 hover:bg-white/10" onClick={() => { setMenu(null); setConfirm({ kind: 'delete', path }); }}>{t('source_files.delete')}</button>
                    </div>
                  ) : null}
                </li>
                </React.Fragment>
              ))}
              {naming?.from === null ? (
                <li className="flex"><NameInput naming={naming} setNaming={setNaming} commit={commitName} error={naming.value.trim() ? nameError(naming.value.trim(), null) : null} /></li>
              ) : null}
            </ul>
          </nav>
        ) : null}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {activeAuthor?.readOnly && editable ? (
            <p role="note" className="flex shrink-0 items-center gap-1.5 border-b border-white/10 bg-white/5 px-3 py-1 text-white/70">
              <Lock className="size-3" />{t('source_files.read_only')}
            </p>
          ) : null}
          {showsNotCompiled(active) && editable ? (
            <p role="note" className="shrink-0 border-b border-white/10 bg-amber-400/10 px-3 py-1 text-amber-200">{t('source_files.not_compiled_hint')}</p>
          ) : null}
          <div className="min-h-0 flex-1">
            <MonacoEditor
              beforeMount={registerPaircodeTheme}
              height="100%"
              onMount={handleMount}
              options={{
                automaticLayout: true,
                readOnly: activeReadOnly,
                domReadOnly: !editable,
                fontFamily: EDITOR_FONT_FAMILY,
                fontSize,
                glyphMargin: true,
                lineNumbers: 'on',
                minimap: { enabled: false },
                padding: { bottom: 12, top: 12 },
                scrollBeyondLastLine: false,
                tabSize: 4,
                wordWrap: 'off',
              }}
              theme={theme}
            />
          </div>
        </div>
      </div>

      {confirm ? (
        <div role="alertdialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-80 rounded-lg border border-white/10 bg-[#2d2d2d] p-4 text-[13px] text-white">
            <p>{confirm.kind === 'delete' ? t('source_files.delete_confirm', { path: confirm.path }) : t('source_files.reset_file_confirm', { path: confirm.path })}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded px-3 py-1 hover:bg-white/10" onClick={() => setConfirm(null)}>{t('action.cancel')}</button>
              <button
                type="button"
                className="rounded bg-red-500/80 px-3 py-1 hover:bg-red-500"
                onClick={() => {
                  if (confirm.kind === 'delete') deleteFile(confirm.path);
                  else resetFile(confirm.path);
                  setConfirm(null);
                }}
              >
                {confirm.kind === 'delete' ? t('source_files.delete') : t('source_files.reset_file')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NameInput({
  naming,
  setNaming,
  commit,
  error,
}: {
  naming: { from: string | null; value: string };
  setNaming: (value: { from: string | null; value: string } | null) => void;
  commit: () => void;
  error: string | null;
}) {
  return (
    <div className="w-full px-1 py-0.5">
      <input
        autoFocus
        spellCheck={false}
        aria-invalid={Boolean(error)}
        value={naming.value}
        placeholder="helper.c"
        onChange={(event) => setNaming({ ...naming, value: event.target.value })}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') setNaming(null);
        }}
        onBlur={() => (naming.value.trim() && !error ? commit() : setNaming(null))}
        className="w-full rounded border border-white/20 bg-black/30 px-1.5 py-0.5 text-white outline-none focus:border-brand"
      />
      {error ? <p role="alert" className="px-0.5 pt-0.5 text-[10px] leading-tight text-red-300">{error}</p> : null}
    </div>
  );
}

/** A path's folder, or '' for a top-level file. */
function folderOf(path: string): string {
  const at = path.lastIndexOf('/');
  return at < 0 ? '' : path.slice(0, at);
}

function FileIcon({ path }: { path: string }) {
  const header = /\.(h|hpp)$/i.test(path);
  return <FileCode2 aria-hidden className={`size-3.5 shrink-0 ${header ? 'text-violet-300' : 'text-sky-300'}`} />;
}

/** Turn a model's text into `next` with one edit: the caret and undo survive. */
function replaceMinimally(model: TextModel, next: string) {
  const current = model.getValue(1);
  if (current === next) return;
  let start = 0;
  const limit = Math.min(current.length, next.length);
  while (start < limit && current.charCodeAt(start) === next.charCodeAt(start)) start += 1;
  let end = 0;
  while (end < limit - start && current.charCodeAt(current.length - 1 - end) === next.charCodeAt(next.length - 1 - end)) end += 1;
  const from = model.getPositionAt(start);
  const to = model.getPositionAt(current.length - end);
  model.pushEditOperations(
    [],
    [{ range: { startLineNumber: from.lineNumber, startColumn: from.column, endLineNumber: to.lineNumber, endColumn: to.column }, text: next.slice(start, next.length - end) }],
    () => null,
  );
}
