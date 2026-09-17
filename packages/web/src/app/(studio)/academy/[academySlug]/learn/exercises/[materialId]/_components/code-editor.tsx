'use client';

import type { OnMount } from '@monaco-editor/react';
import dynamic from 'next/dynamic';
import * as React from 'react';

import { useLayoutTranslation } from '@/i18n';
import { pinLfOnMount } from '@/lib/monaco/line-endings';
import { EDITOR_FONT_FAMILY, registerPaircodeTheme } from '@/lib/monaco/theme';

// Monaco is ~1 MB and is only ever needed here, so it never enters the catalog
// or outline bundles.
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => <EditorFallback />,
});

/**
 * How long the editor may take before loading is reported as failed.
 *
 * Monaco itself comes from jsDelivr at runtime. A network that filters the CDN
 * never answers with an error the loader surfaces, so without a deadline the
 * student watches "Loading editor…" forever.
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
}: {
  code: string;
  fontSize: number;
  onChange: (value: string) => void;
  onMount?: OnMount;
}) {
  const handleMount = React.useMemo(() => pinLfOnMount(onMount), [onMount]);

  return (
    <div className="min-h-0 flex-1 bg-editor-bg">
      <MonacoEditor
        beforeMount={registerPaircodeTheme}
        height="100%"
        language="python"
        // The dynamic import above covers the React wrapper; this covers
        // Monaco itself, which is fetched separately and is the slow half.
        loading={<EditorFallback />}
        onChange={(next) => onChange(next ?? '')}
        onMount={handleMount}
        options={{
          automaticLayout: true,
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
        theme="paircode-dark"
        value={code}
      />
    </div>
  );
}
