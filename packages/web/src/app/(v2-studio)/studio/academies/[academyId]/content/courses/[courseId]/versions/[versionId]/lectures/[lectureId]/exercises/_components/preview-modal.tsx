'use client';

import { EyeOff, Info, X } from 'lucide-react';
import * as React from 'react';

import { useLayoutTranslation } from '@/i18n';

import { type ExerciseDraft } from '../_lib/exercise-draft';
import { RichTextFrame } from '@/components/studio/rich-text-frame';

/** Same green → amber → red scale the course builder uses for difficulty. */
const difficultyStyles = {
  EASY: 'bg-success/10 text-success',
  MEDIUM: 'bg-warning/10 text-warning',
  HARD: 'bg-danger/10 text-danger',
} as const;

function Section({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section>
      {/* A rule under each heading keeps sections from bleeding together. */}
      <h3 className="border-b border-border pb-1.5 text-[13px] font-bold uppercase tracking-[0.06em] text-sub">
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Values students can copy: dark, monospaced, unmistakably literal. */
function ValueBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 font-mono text-[11.5px] font-bold uppercase tracking-wider text-sub">
        {label}
      </div>
      <pre className="overflow-x-auto rounded-lg bg-[#0f172a] px-3 py-2.5 font-mono text-[13px] leading-[1.6] text-[#e2e8f0]">
        {value || ' '}
      </pre>
    </div>
  );
}

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
  const hiddenCount = draft.testCases.length - sampleCases.length;
  const visibleHints = draft.hints.filter((hint) => hint.content.trim());
  const constraintLines = draft.constraints
    .split('\n')
    .map((line) => line.replace(/^[•·-]\s*/, '').trim())
    .filter(Boolean);
  const hasDescription = draft.description.trim().length > 0;
  const hasFormat =
    draft.inputFormat.trim().length > 0 || draft.outputFormat.trim().length > 0;

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4"
      onClick={onClose}
      role="dialog"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-modal bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand">
              {t('exercise.preview')}
            </p>
            <h2 className="mt-1 truncate text-[19px] font-extrabold tracking-[-0.02em]">
              {draft.title.trim() || t('exercise.preview_untitled')}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  difficultyStyles[draft.difficulty]
                }`}
              >
                {t(`exercise.difficulty.${draft.difficulty}`)}
              </span>
              <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-bold text-sub">
                {t('exercise.language_python')}
              </span>
              {draft.isPublished ? null : (
                <span className="inline-flex items-center gap-1 rounded-full bg-retired-soft px-2 py-0.5 text-[11px] font-bold text-retired">
                  <EyeOff className="size-2.5" />
                  {t('exercise.badge.hidden')}
                </span>
              )}
            </div>
          </div>
          <button
            aria-label={t('exercise.preview_close')}
            className="grid size-9 shrink-0 place-items-center rounded-lg text-sub hover:bg-canvas hover:text-ink"
            onClick={onClose}
            type="button"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <p className="mb-6 flex items-start gap-2 rounded-lg bg-brand-soft/50 px-3.5 py-2.5 text-[12.5px] leading-5 text-brand-deep">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            {t('exercise.preview_student_note')}
          </p>

          <div className="space-y-7">
            <Section title={t('exercise.preview_problem')}>
              {hasDescription ? (
                <RichTextFrame
                  content={draft.description}
                  fallbackHeight={80}
                  minHeight={24}
                  padding={0}
                  title={t('exercise.field.description')}
                />
              ) : (
                <p className="rounded-lg border border-dashed border-border px-3.5 py-3 text-[13px] text-sub">
                  {t('exercise.preview_no_description')}
                </p>
              )}
            </Section>

            {/* Format is prose describing the shape of the data. Examples are
                literal values. Separating them is the whole point here. */}
            {hasFormat ? (
              <Section title={t('exercise.preview_format')}>
                <dl className="grid gap-4 sm:grid-cols-2">
                  {draft.inputFormat.trim() ? (
                    <div className="rounded-lg border border-border px-4 py-3">
                      <dt className="text-[12px] font-bold text-sub">
                        {t('exercise.preview_input')}
                      </dt>
                      <dd className="mt-1 whitespace-pre-wrap text-[14px] leading-6">
                        {draft.inputFormat}
                      </dd>
                    </div>
                  ) : null}
                  {draft.outputFormat.trim() ? (
                    <div className="rounded-lg border border-border px-4 py-3">
                      <dt className="text-[12px] font-bold text-sub">
                        {t('exercise.preview_output')}
                      </dt>
                      <dd className="mt-1 whitespace-pre-wrap text-[14px] leading-6">
                        {draft.outputFormat}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </Section>
            ) : null}

            {sampleCases.length > 0 ? (
              <Section title={t('exercise.preview_examples')}>
                <div className="space-y-4">
                  {sampleCases.map((testCase, index) => (
                    <article
                      className="rounded-lg border border-border p-4"
                      key={testCase.key}
                    >
                      <h4 className="mb-3 text-[13.5px] font-bold">
                        {t('exercise.preview_example_n', {
                          number: index + 1,
                        })}
                      </h4>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <ValueBlock
                          label={t('exercise.preview_stdin')}
                          value={testCase.input}
                        />
                        <ValueBlock
                          label={t('exercise.preview_stdout')}
                          value={testCase.expectedOutput}
                        />
                      </div>
                    </article>
                  ))}
                </div>
              </Section>
            ) : null}

            {constraintLines.length > 0 ? (
              <Section title={t('exercise.preview_constraints')}>
                <ul className="space-y-2">
                  {constraintLines.map((line, index) => (
                    <li className="flex items-start gap-2.5" key={index}>
                      <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-sub/60" />
                      <span className="font-mono text-[13px] leading-6">
                        {line}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {draft.starterCode.trim() ? (
              <Section title={t('exercise.preview_starter')}>
                <pre className="overflow-x-auto rounded-lg bg-[#0f172a] px-4 py-3.5 font-mono text-[13px] leading-[1.65] text-[#e2e8f0]">
                  {draft.starterCode}
                </pre>
              </Section>
            ) : null}

            {visibleHints.length > 0 ? (
              <Section title={t('exercise.section.hints')}>
                <ol className="space-y-2">
                  {visibleHints.map((hint, index) => (
                    <li
                      className="flex items-start gap-2.5 rounded-lg border border-border bg-canvas px-3.5 py-3"
                      key={hint.key}
                    >
                      <span className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-brand-soft text-[11px] font-bold text-brand">
                        {index + 1}
                      </span>
                      <span className="whitespace-pre-wrap text-[14px] leading-6">
                        {hint.content}
                      </span>
                    </li>
                  ))}
                </ol>
              </Section>
            ) : null}
          </div>
        </div>

        {hiddenCount > 0 ? (
          <footer className="flex shrink-0 items-center gap-2 border-t border-border bg-canvas px-6 py-3">
            <EyeOff className="size-3.5 shrink-0 text-sub" />
            <p className="text-[12.5px] leading-5 text-sub">
              {t('exercise.preview_hidden_count', { count: hiddenCount })}
            </p>
          </footer>
        ) : null}
      </div>
    </div>
  );
}
