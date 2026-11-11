import type { ExerciseLanguage } from '@cove/shared';

import { LanguageIcon } from '@/components/studio/language-icon';

const tone: Record<ExerciseLanguage, string> = {
  PYTHON: 'border-lang-python-on-editor/40 bg-lang-python-on-editor/15 text-lang-python-on-editor',
  C: 'border-lang-c-on-editor/40 bg-lang-c-on-editor/15 text-lang-c-on-editor',
  CPP: 'border-lang-cpp-on-editor/40 bg-lang-cpp-on-editor/15 text-lang-cpp-on-editor',
};

/**
 * The language a problem is written in, on the editor's dark chrome. Bold and
 * coloured per language, so it reads at a glance which compiler runs the code.
 */
export function LanguageTag({ language, label }: { language: ExerciseLanguage; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[12.5px] font-bold ${tone[language]}`}>
      <LanguageIcon className="size-3.5" language={language} />
      {label}
    </span>
  );
}
