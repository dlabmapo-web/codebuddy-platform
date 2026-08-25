'use client';

import dynamic from 'next/dynamic';
import { useTranslation } from 'react-i18next';

import { registerPaircodeTheme } from '@/lib/monaco/theme';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => <EditorFallback />,
});

function EditorFallback() {
  const { t } = useTranslation('monitoring');
  return (
    <div className="flex flex-1 items-center justify-center bg-editor-bg">
      <span className="text-[13px] text-white/50">{t('preview.loading')}</span>
    </div>
  );
}

/**
 * The starting code of an exercise the teacher is reading.
 *
 * Deliberately not `LiveEditor`: that one takes a `Y.Text` and writes every
 * keystroke into a shared document. This takes a string. There is no document
 * here to join, no draft id in the payload that produced it, and no change
 * handler — which is what makes "a preview cannot reach the student" a
 * property of the component rather than a flag somebody has to set.
 */
export function PreviewEditor({
  code,
  fontSize,
}: {
  code: string;
  fontSize: number;
}) {
  return (
    <div className="min-h-0 flex-1 bg-editor-bg">
      <MonacoEditor
        beforeMount={registerPaircodeTheme}
        height="100%"
        language="python"
        options={{
          automaticLayout: true,
          domReadOnly: true,
          fontFamily: "'Fira Code', Consolas, monospace",
          fontSize,
          lineNumbers: 'on',
          minimap: { enabled: false },
          padding: { bottom: 12, top: 12 },
          readOnly: true,
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
