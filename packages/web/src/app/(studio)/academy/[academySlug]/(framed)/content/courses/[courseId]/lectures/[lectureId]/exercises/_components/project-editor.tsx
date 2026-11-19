'use client';

import {
  exerciseFileTreeModes,
  exerciseProjectIssues,
  isCompiledSource,
  sourceExtensionsFor,
  sourcePathError,
  type CompiledLanguage,
  type ExerciseFileTreeMode,
  type ExerciseProject,
  type ExerciseProjectFile,
} from '@cove/shared';
import { Code2, FileCode2, MoreVertical, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import dynamic from 'next/dynamic';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/studio/button';
import { ChoiceSelector } from '@/components/studio/choice-selector';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/studio/overlays';
import { Modal, ModalContent } from '@/components/studio/primitives';
import { EDITOR_FONT_FAMILY, registerPaircodeTheme } from '@/lib/monaco/theme';
import { projectTemplate } from '@/lib/workspace/file-bundle';

import { SectionCard } from './authoring-fields';

const MonacoEditor = dynamic(() => import('@/lib/monaco/editor'), { ssr: false });

/**
 * A multi-file C/C++ problem's files, for a Team Lead or Manager.
 *
 * The author lists files, marks each read-only, hidden or open at start, ticks
 * the files that are compiled, and decides whether a student's own files are
 * compiled too. Each file row has a ⋮ menu for Rename and Delete. The command
 * it amounts to is shown, read-only, below.
 */
export function ProjectEditor({
  project,
  language,
  editable,
  onChange,
}: {
  project: ExerciseProject;
  language: CompiledLanguage;
  editable: boolean;
  onChange: (project: ExerciseProject) => void;
}) {
  const { t } = useTranslation('exercise-files');
  const [selected, setSelected] = React.useState(project.files[0]?.path ?? '');
  const [adding, setAdding] = React.useState<string | null>(null);
  const [renaming, setRenaming] = React.useState<{ from: string; value: string } | null>(null);
  const [deleting, setDeleting] = React.useState<string | null>(null);
  const current = project.files.find((file) => file.path === selected) ?? project.files[0];
  const issues = exerciseProjectIssues(project, language);
  const compiled = new Set(project.sources);

  const nameError = (name: string, except?: string) =>
    sourcePathError(name, language)
      ? `${sourceExtensionsFor(language).join(' ')}`
      : project.files.some((file) => file.path !== except && file.path.toLowerCase() === name.toLowerCase())
        ? 'duplicate'
        : null;

  const setFile = (path: string, patch: Partial<ExerciseProjectFile>) =>
    onChange({ ...project, files: project.files.map((file) => (file.path === path ? normalize({ ...file, ...patch }) : file)) });
  const setCompiled = (path: string, on: boolean) =>
    onChange({
      ...project,
      // Kept in file order: the compile order is the list order.
      sources: project.files.map((file) => file.path).filter((item) => (item === path ? on : compiled.has(item))),
    });
  const addFile = (path: string) => {
    onChange({
      ...project,
      files: [...project.files, { path, content: '', readOnly: false, hidden: false, openByDefault: true }],
      sources: isCompiledSource(path, language) ? [...project.sources, path] : project.sources,
    });
    setSelected(path);
    setAdding(null);
  };
  const renameFile = (from: string, to: string) => {
    onChange({
      ...project,
      files: project.files.map((file) => (file.path === from ? { ...file, path: to } : file)),
      sources: project.sources
        .map((source) => (source === from ? to : source))
        .filter((source) => source !== to || isCompiledSource(to, language)),
    });
    setSelected(to);
    setRenaming(null);
  };
  const deleteFile = (path: string) => {
    setDeleting(null);
    onChange({ ...project, files: project.files.filter((file) => file.path !== path), sources: project.sources.filter((source) => source !== path) });
    setSelected(project.files.find((file) => file.path !== path)?.path ?? '');
  };

  const flag = 'inline-flex items-center gap-1.5 text-xs';
  return (
    <SectionCard description={t('help')} icon={Code2} title={t('title')}>
      <div className="space-y-4">
        {editable ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-sub">{t('template')}:</span>
            <button type="button" className="rounded-lg border border-border px-3 py-1.5" onClick={() => {
              const template = projectTemplate(language);
              onChange(template);
              setSelected(template.files[0]!.path);
            }}>{language === 'C' ? 'main.c + sum.c + sum.h' : 'main.cpp + rectangle.cpp + rectangle.h'}</button>
          </div>
        ) : null}

        <div className="flex min-h-[320px] overflow-hidden rounded-xl border border-[#2d2d2d] bg-[#1e1e1e] text-[13px] text-white/80">
          <aside className="flex w-56 shrink-0 flex-col border-r border-white/10">
            <ul className="flex-1 overflow-y-auto py-1">
              {project.files.map((file) => (
                <li key={file.path}>
                  {renaming?.from === file.path ? (
                    <NameField
                      value={renaming.value}
                      error={renaming.value.trim() ? nameError(renaming.value.trim(), file.path) : null}
                      label={t('file_name')}
                      onChange={(value) => setRenaming({ from: file.path, value })}
                      onCommit={() => renameFile(file.path, renaming.value.trim())}
                      onCancel={() => setRenaming(null)}
                    />
                  ) : (
                    <div className={`group flex items-center ${file.path === current?.path ? 'bg-white/10 text-white' : 'hover:bg-white/5'}`}>
                      <button
                        type="button"
                        onClick={() => setSelected(file.path)}
                        onDoubleClick={() => editable && setRenaming({ from: file.path, value: file.path })}
                        className="flex min-w-0 flex-1 items-center gap-1.5 py-1 pl-3 pr-1 text-left"
                      >
                        <FileCode2 aria-hidden className={`size-3.5 shrink-0 ${file.path.endsWith('.h') || file.path.endsWith('.hpp') ? 'text-violet-300' : 'text-sky-300'}`} />
                        <span className={`truncate ${file.hidden ? 'italic opacity-60' : ''}`}>{file.path}</span>
                        {compiled.has(file.path) ? <span className="ml-auto shrink-0 rounded bg-emerald-400/15 px-1 text-[10px] text-emerald-300">{t('compiled')}</span> : null}
                      </button>
                      {editable ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              aria-label={t('file_actions', { path: file.path })}
                              className={`mr-1 grid size-6 shrink-0 place-items-center rounded text-white/60 outline-none hover:bg-white/10 hover:text-white focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-brand/60 data-[state=open]:bg-white/10 data-[state=open]:opacity-100 ${file.path === current?.path ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                            >
                              <MoreVertical aria-hidden className="size-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-44 text-[14px]" onCloseAutoFocus={(event) => event.preventDefault()}>
                            <DropdownMenuItem onSelect={() => setRenaming({ from: file.path, value: file.path })}>
                              <Pencil />{t('rename')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={project.files.length === 1}
                              className="text-danger focus:bg-danger/10 focus:text-danger"
                              onSelect={() => setDeleting(file.path)}
                            >
                              <Trash2 />{t('delete')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </div>
                  )}
                </li>
              ))}
              {adding !== null ? (
                <li>
                  <NameField
                    value={adding}
                    error={adding.trim() ? nameError(adding.trim()) : null}
                    label={t('file_name')}
                    onChange={setAdding}
                    onCommit={() => addFile(adding.trim())}
                    onCancel={() => setAdding(null)}
                  />
                </li>
              ) : null}
            </ul>
            {editable ? (
              <div className="flex border-t border-white/10">
                <button type="button" onClick={() => setAdding('')} className="flex flex-1 items-center gap-1.5 px-3 py-2 text-left hover:bg-white/5">
                  <Plus aria-hidden className="size-3.5" />{t('add_file')}
                </button>
                <label title={t('upload')} aria-label={t('upload')} className="flex cursor-pointer items-center px-3 hover:bg-white/5">
                  <Upload aria-hidden className="size-3.5" />
                  <input type="file" multiple className="sr-only" accept={sourceExtensionsFor(language).join(',')} onChange={async (event) => {
                    const picked = Array.from(event.target.files ?? []);
                    event.target.value = '';
                    let next = project;
                    for (const file of picked) {
                      if (sourcePathError(file.name, language) || next.files.some((item) => item.path.toLowerCase() === file.name.toLowerCase()) || file.size > 100_000) continue;
                      const content = (await file.text()).replace(/\r\n?/g, '\n');
                      next = {
                        ...next,
                        files: [...next.files, { path: file.name, content, readOnly: false, hidden: false, openByDefault: true }],
                        sources: isCompiledSource(file.name, language) ? [...next.sources, file.name] : next.sources,
                      };
                    }
                    if (next !== project) { onChange(next); setSelected(next.files[next.files.length - 1]!.path); }
                  }} />
                </label>
              </div>
            ) : null}
          </aside>

          {current ? (
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-white/10 bg-[#252526] px-3 py-1.5">
                <span className="font-semibold text-white">{current.path}</span>
                <label className={flag} title={t('read_only_help')}>
                  <input type="checkbox" disabled={!editable || current.hidden} checked={current.readOnly} onChange={(event) => setFile(current.path, { readOnly: event.target.checked })} />{t('read_only')}
                </label>
                <label className={flag} title={t('hidden_help')}>
                  <input type="checkbox" disabled={!editable} checked={current.hidden} onChange={(event) => setFile(current.path, { hidden: event.target.checked })} />{t('hidden')}
                </label>
                <label className={flag} title={t('open_help')}>
                  <input type="checkbox" disabled={!editable || current.hidden} checked={current.openByDefault} onChange={(event) => setFile(current.path, { openByDefault: event.target.checked })} />{t('open_by_default')}
                </label>
                {isCompiledSource(current.path, language) ? (
                  <label className={flag} title={t('compiled_help')}>
                    <input type="checkbox" disabled={!editable} checked={compiled.has(current.path)} onChange={(event) => setCompiled(current.path, event.target.checked)} />{t('compiled')}
                  </label>
                ) : null}
              </div>
              <div className="min-h-[280px] flex-1">
                <MonacoEditor
                  key={current.path}
                  beforeMount={registerPaircodeTheme}
                  height="100%"
                  language={language === 'C' ? 'c' : 'cpp'}
                  theme="paircode-dark"
                  value={current.content}
                  onChange={(content) => setFile(current.path, { content: content ?? '' })}
                  options={{ automaticLayout: true, fontFamily: EDITOR_FONT_FAMILY, fontSize: 13, lineNumbers: 'on', minimap: { enabled: false }, readOnly: !editable, scrollBeyondLastLine: false, tabSize: 4, wordWrap: 'off' }}
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" disabled={!editable} checked={project.includeLearnerSources} onChange={(event) => onChange({ ...project, includeLearnerSources: event.target.checked })} />
            <span>{t('learner_sources')}<span className="block text-xs text-sub">{t(project.includeLearnerSources ? 'learner_sources_on' : 'learner_sources_off')}</span></span>
          </label>
          <div>
            <p>{t('file_tree')}</p>
            <ChoiceSelector
              label={t('file_tree')}
              className="mt-1"
              disabled={!editable}
              selectedId={project.fileTree}
              list={exerciseFileTreeModes.map((mode) => ({ id: mode, name: t(`file_tree_${treeKey(mode)}`) }))}
              onSelect={(item) => onChange({ ...project, fileTree: item.id })}
            />
            <p className="mt-1 text-xs text-sub">{t(`file_tree_${treeKey(project.fileTree)}_help`)}</p>
          </div>
        </div>

        <div className="text-sm">
          <p className="text-sub">{t('command')}</p>
          <code className="mt-1 block overflow-x-auto rounded-lg bg-[#1e1e1e] px-3 py-2 font-mono text-[12px] text-white/80">
            {`${language === 'C' ? 'gcc' : 'g++'} ${project.sources.join(' ')}${project.includeLearnerSources ? ' …' : ''} -o main && ./main`}
          </code>
        </div>

        {issues.length ? (
          <div role="alert" className="rounded-lg border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
            <p className="font-semibold">{t('issues')}</p>
            <ul className="mt-1 list-disc pl-5">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
          </div>
        ) : null}
      </div>

      <Modal open={deleting !== null} onOpenChange={(open) => { if (!open) setDeleting(null); }}>
        <ModalContent title={t('delete_confirm', { path: deleting ?? '' })} description={t('delete_help')}>
          <div className="flex justify-end gap-2 px-6 py-4">
            <Button type="button" variant="ghost" onClick={() => setDeleting(null)}>{t('cancel')}</Button>
            <Button type="button" variant="danger" onClick={() => deleting && deleteFile(deleting)}>{t('delete')}</Button>
          </div>
        </ModalContent>
      </Modal>
    </SectionCard>
  );
}

function treeKey(mode: ExerciseFileTreeMode) {
  return mode.toLowerCase() as 'closed' | 'open' | 'disabled';
}

/** A hidden file is never read-only or open at start; the switches follow. */
function normalize(file: ExerciseProjectFile): ExerciseProjectFile {
  return file.hidden ? { ...file, readOnly: false, openByDefault: false } : file;
}

function NameField({ value, error, label, onChange, onCommit, onCancel }: {
  value: string; error: string | null; label: string;
  onChange: (value: string) => void; onCommit: () => void; onCancel: () => void;
}) {
  return (
    <div className="px-2 py-1">
      <input
        autoFocus
        aria-label={label}
        aria-invalid={Boolean(error)}
        spellCheck={false}
        value={value}
        placeholder="helper.c"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && value.trim() && !error) onCommit();
          if (event.key === 'Escape') onCancel();
        }}
        onBlur={() => (value.trim() && !error ? onCommit() : onCancel())}
        className="w-full rounded border border-white/20 bg-black/30 px-1.5 py-0.5 text-white outline-none focus:border-brand"
      />
      {error ? <p role="alert" className="pt-0.5 text-[10px] text-red-300">{error === 'duplicate' ? '✕' : error}</p> : null}
    </div>
  );
}
