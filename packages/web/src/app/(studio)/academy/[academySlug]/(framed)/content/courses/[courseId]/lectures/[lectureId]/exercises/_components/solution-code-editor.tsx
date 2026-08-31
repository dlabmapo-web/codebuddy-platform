import { BadgeCheck } from 'lucide-react';
import dynamic from 'next/dynamic';

import { useLayoutTranslation } from '@/i18n';
import { registerPaircodeTheme } from '@/lib/monaco/theme';

import { Field, SectionCard } from './authoring-fields';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
});

export function SolutionCodeEditor({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (value: string) => void;
  error: string | null;
}) {
  const { t } = useLayoutTranslation('content');

  return (
    <SectionCard
      description={t('exercise.solution_code_help')}
      icon={BadgeCheck}
      title={t('exercise.field.solution_code')}
    >
      <Field
        as="group"
        error={error}
        label={t('exercise.field.solution_code')}
        required
      >
        <div
          className={`overflow-hidden rounded-xl border bg-[#1e1e1e] ${
            error ? 'border-danger' : 'border-[#2d2d2d]'
          }`}
        >
          <div className="border-b border-white/10 bg-[#2d2d2d] px-3 py-2 font-mono text-[12px] text-[#a5a5a5]">
            {t('exercise.language_python')}
          </div>
          <MonacoEditor
            beforeMount={registerPaircodeTheme}
            height="320px"
            language="python"
            onChange={(next) => onChange(next ?? '')}
            options={{
              automaticLayout: true,
              fontFamily: "'Fira Code', Consolas, monospace",
              fontSize: 13,
              lineNumbers: 'on',
              minimap: { enabled: false },
              padding: { bottom: 10, top: 10 },
              scrollBeyondLastLine: false,
              tabSize: 4,
              wordWrap: 'off',
            }}
            theme="paircode-dark"
            value={value}
          />
        </div>
      </Field>
    </SectionCard>
  );
}
