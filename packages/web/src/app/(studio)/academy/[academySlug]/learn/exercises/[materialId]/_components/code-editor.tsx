'use client';

import type { OnMount } from '@monaco-editor/react';
import dynamic from 'next/dynamic';

import { useLayoutTranslation } from '@/i18n';
import { registerPaircodeTheme } from '@/lib/monaco/theme';

// Monaco is ~1 MB and is only ever needed here, so it never enters the catalog
// or outline bundles.
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => <EditorFallback />,
});

function EditorFallback() {
  const { t } = useLayoutTranslation('learn');
  return (
    <div className="flex flex-1 items-center justify-center bg-editor-bg">
      <span className="text-[13px] text-white/50">
        {t('workspace.editor_loading')}
      </span>
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
  return (
    <div className="min-h-0 flex-1 bg-editor-bg">
      <MonacoEditor
        beforeMount={registerPaircodeTheme}
        height="100%"
        language="python"
        onChange={(next) => onChange(next ?? '')}
        onMount={onMount}
        options={{
          automaticLayout: true,
          fontFamily: "'Fira Code', Consolas, monospace",
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
