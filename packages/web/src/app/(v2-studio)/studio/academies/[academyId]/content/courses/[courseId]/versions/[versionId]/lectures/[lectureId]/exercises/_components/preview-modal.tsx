import { X } from 'lucide-react';

import { useLayoutTranslation } from '@/i18n';

import {
  previewDocument,
  type ExerciseDraft,
} from '../_lib/exercise-draft';

export function PreviewModal({
  draft,
  onClose,
}: {
  draft: ExerciseDraft;
  onClose: () => void;
}) {
  const { t } = useLayoutTranslation('content');
  const sampleCases = draft.testCases.filter(
    (testCase) => testCase.visibility === 'SAMPLE',
  );
  const visibleHints = draft.hints.filter((hint) => hint.content.trim());

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-ink/45 p-4"
      role="dialog"
    >
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-card bg-white shadow-2xl">
        <header className="sticky top-0 flex items-center justify-between border-b border-border bg-white px-5 py-4">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-wider text-brand">
              {t('exercise.preview')}
            </p>
            <h2 className="mt-0.5 text-lg font-extrabold">
              {draft.title || t('exercise.preview_untitled')}
            </h2>
            <p className="mt-1 text-[12px] font-semibold text-sub">
              {t(`exercise.difficulty.${draft.difficulty}`)}
            </p>
          </div>
          <button
            aria-label={t('exercise.preview_close')}
            className="grid size-9 place-items-center rounded-lg hover:bg-canvas"
            onClick={onClose}
            type="button"
          >
            <X className="size-5" />
          </button>
        </header>
        <div className="space-y-6 p-5 sm:p-7">
          <iframe
            className="min-h-72 w-full border-0"
            sandbox=""
            srcDoc={previewDocument(draft.description)}
            title={t('exercise.field.description')}
          />
          {draft.constraints ? (
            <div>
              <h3 className="text-[13px] font-bold">
                {t('exercise.field.constraints')}
              </h3>
              <p className="mt-1 whitespace-pre-wrap text-[14px] leading-6">
                {draft.constraints}
              </p>
            </div>
          ) : null}
          {draft.starterCode ? (
            <div>
              <h3 className="text-[13px] font-bold">
                {t('exercise.field.starter_code')}
              </h3>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-lg bg-[#0f172a] p-4 font-mono text-[12.5px] leading-6 text-slate-100">
                {draft.starterCode}
              </pre>
            </div>
          ) : null}
          {sampleCases.map((testCase) => (
            <div
              className="grid gap-3 rounded-lg border border-border bg-canvas p-4 sm:grid-cols-2"
              key={testCase.key}
            >
              <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[12.5px]">
                {testCase.input}
              </pre>
              <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[12.5px]">
                {testCase.expectedOutput}
              </pre>
            </div>
          ))}
          {visibleHints.length > 0 ? (
            <div>
              <h3 className="text-[13px] font-bold">
                {t('exercise.section.hints')}
              </h3>
              <ol className="mt-2 space-y-2">
                {visibleHints.map((hint) => (
                  <li
                    className="rounded-lg border border-border bg-canvas px-4 py-3 text-[14px] leading-6"
                    key={hint.key}
                  >
                    {hint.content}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
          <p className="text-[12px] text-sub">
            {t('exercise.preview_hidden_notice')}
          </p>
        </div>
      </div>
    </div>
  );
}
