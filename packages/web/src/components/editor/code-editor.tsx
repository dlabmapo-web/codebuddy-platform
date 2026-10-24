'use client';

import type { OnMount } from '@monaco-editor/react';
import dynamic from 'next/dynamic';
import * as React from 'react';

import { useLayoutTranslation } from '@/i18n';
import { pinLfOnMount } from '@/lib/monaco/line-endings';
import { EDITOR_FONT_FAMILY, registerPaircodeTheme } from '@/lib/monaco/theme';

// Monaco is ~1 MB and is only ever needed here, so it never enters the catalog
// or outline bundles.
const MonacoEditor = dynamic(() => import('@/lib/monaco/editor'), {
  ssr: false,
  loading: () => <EditorFallback />,
});

/**
 * How long the editor may take before loading is reported as failed.
 *
 * Monaco assets are served by Cove. Keep a deadline for interrupted requests
 * or stale browser caches so students can recover instead of watching
 * "Loading editor…" forever.
 */
const EDITOR_LOAD_DEADLINE_MS = 15_000;

function EditorFallback() {
  const { t } = useLayoutTranslation('learn');
  const [overdue, setOverdue] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => setOverdue(true), EDITOR_LOAD_DEADLINE_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 bg-editor-bg px-6 text-center">
      {overdue ? (
        <>
          <span className="text-[13px] text-white/70" role="alert">
            {t('workspace.editor_load_failed')}
          </span>
          <button
            className="rounded-md border border-white/20 px-3 py-1 text-[12px] font-semibold text-white/80 transition-colors hover:bg-white/10"
            onClick={() => window.location.reload()}
            type="button"
          >
            {t('workspace.editor_reload')}
          </button>
        </>
      ) : (
        <span className="text-[13px] text-white/50">
          {t('workspace.editor_loading')}
        </span>
      )}
    </div>
  );
}

export function CodeEditor({
  code,
  fontSize,
  onChange,
  onMount,
  readOnly = false,
  documentManaged = false,
  theme = 'paircode-dark',
}: {
  code: string;
  fontSize: number;
  onChange: (value: string) => void;
  onMount?: OnMount;
  readOnly?: boolean;
  /** A collaboration binding owns the model; React snapshots may lag its edits. */
  documentManaged?: boolean;
  theme?: 'paircode-dark' | 'light';
}) {
  const handleMount = React.useMemo(() => pinLfOnMount(onMount), [onMount]);

  return (
    <div className="min-h-0 flex-1 bg-editor-bg">
      <MonacoEditor
        beforeMount={registerPaircodeTheme}
        defaultValue={code}
        height="100%"
        language="python"
        // The dynamic import above covers the React wrapper; this covers
        // Monaco itself, which is fetched separately and is the slow half.
        loading={<EditorFallback />}
        onChange={(next) => onChange(next ?? '')}
        onMount={handleMount}
        options={{
          automaticLayout: true,
          readOnly,
          fontFamily: EDITOR_FONT_FAMILY,
          fontSize,
          // Reserved so the failing-line dot has a gutter to sit in; without
          // it the margin appears only when a decoration arrives and the code
          // jumps sideways mid-read.
          glyphMargin: true,
          lineNumbers: 'on',
          minimap: { enabled: false },
          padding: { bottom: 12, top: 12 },
          scrollBeyondLastLine: false,
          tabSize: 4,
          wordWrap: 'off',
        }}
        theme={theme}
        value={documentManaged ? undefined : code}
      />
    </div>
  );
}
