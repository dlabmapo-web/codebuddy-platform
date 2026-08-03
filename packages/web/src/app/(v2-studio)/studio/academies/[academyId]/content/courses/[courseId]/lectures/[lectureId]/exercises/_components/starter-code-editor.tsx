import { Code2 } from 'lucide-react';
import dynamic from 'next/dynamic';

import { useLayoutTranslation } from '@/i18n';
import { registerPaircodeTheme } from '@/lib/monaco/theme';

import { SectionCard } from './authoring-fields';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
});

export function StarterCodeEditor({
  value,
  onChange,
  editable,
}: {
  value: string;
  onChange: (value: string) => void;
  editable: boolean;
}) {
  const { t } = useLayoutTranslation('content');

  return (
    <SectionCard
      description={t('exercise.code_help')}
      icon={Code2}
      title={t('exercise.field.starter_code')}
    >
      <div className="overflow-hidden rounded-xl border border-[#2d2d2d] bg-[#1e1e1e]">
        <div className="border-b border-white/10 bg-[#2d2d2d] px-3 py-2 font-mono text-[12px] text-[#a5a5a5]">
          {t('exercise.language_python')}
        </div>
        <MonacoEditor
          beforeMount={registerPaircodeTheme}
          height="280px"
          language="python"
          onChange={(next) => onChange(next ?? '')}
          options={{
            automaticLayout: true,
            fontFamily: "'Fira Code', Consolas, monospace",
            fontSize: 13,
            lineNumbers: 'on',
            minimap: { enabled: false },
            padding: { bottom: 10, top: 10 },
            readOnly: !editable,
            scrollBeyondLastLine: false,
            tabSize: 4,
            wordWrap: 'off',
          }}
          theme="paircode-dark"
          value={value}
        />
      </div>
    </SectionCard>
  );
}
