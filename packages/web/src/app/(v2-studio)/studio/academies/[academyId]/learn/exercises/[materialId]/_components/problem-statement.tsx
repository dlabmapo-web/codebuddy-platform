'use client';

import type { LearnExercise } from '@cove/shared';
import { EyeOff, Lightbulb } from 'lucide-react';
import * as React from 'react';

import { RichTextFrame } from '@/components/studio/rich-text-frame';
import { useLayoutTranslation } from '@/i18n';

function Section({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section>
      <h3 className="border-b border-border pb-1.5 text-[13px] font-bold uppercase tracking-[0.06em] text-sub">
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Literal values a student can copy: dark, monospaced, unmistakably data. */
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

export function ProblemStatement({ exercise }: { exercise: LearnExercise }) {
  const { t } = useLayoutTranslation(['learn', 'content']);
  const [revealed, setRevealed] = React.useState(0);

  const constraintLines = exercise.constraints
    .split('\n')
    .map((line) => line.replace(/^[•·-]\s*/, '').trim())
    .filter(Boolean);
  const hasFormat =
    exercise.inputFormat.trim().length > 0 ||
    exercise.outputFormat.trim().length > 0;

  return (
    <div className="space-y-7 px-5 py-5">
      {exercise.description.trim() ? (
        <Section title={t('learn:workspace.problem')}>
          {/* Authored HTML stays sandboxed — it must never restyle or script
              the workspace around it. */}
          <RichTextFrame
            content={exercise.description}
            fallbackHeight={120}
            minHeight={24}
            padding={0}
            title={t('learn:workspace.problem')}
          />
        </Section>
      ) : null}

      {hasFormat ? (
        <Section title={t('learn:workspace.format')}>
          <dl className="grid gap-4 sm:grid-cols-2">
            {exercise.inputFormat.trim() ? (
              <div className="rounded-lg border border-border px-4 py-3">
                <dt className="text-[12px] font-bold text-sub">
                  {t('learn:workspace.input')}
                </dt>
                <dd className="mt-1 whitespace-pre-wrap text-[14px] leading-6">
                  {exercise.inputFormat}
                </dd>
              </div>
            ) : null}
            {exercise.outputFormat.trim() ? (
              <div className="rounded-lg border border-border px-4 py-3">
                <dt className="text-[12px] font-bold text-sub">
                  {t('learn:workspace.output')}
                </dt>
                <dd className="mt-1 whitespace-pre-wrap text-[14px] leading-6">
                  {exercise.outputFormat}
                </dd>
              </div>
            ) : null}
          </dl>
        </Section>
      ) : null}

      {exercise.sampleTestCases.length > 0 ? (
        <Section title={t('learn:workspace.examples')}>
          <div className="space-y-4">
            {exercise.sampleTestCases.map((testCase, index) => (
              <article
                className="rounded-lg border border-border p-4"
                key={testCase.position}
              >
                <h4 className="mb-3 text-[13.5px] font-bold">
                  {t('learn:workspace.example_n', { number: index + 1 })}
                </h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ValueBlock
                    label={t('learn:workspace.stdin')}
                    value={testCase.input}
                  />
                  <ValueBlock
                    label={t('learn:workspace.stdout')}
                    value={testCase.expectedOutput}
                  />
                </div>
              </article>
            ))}
          </div>
        </Section>
      ) : null}

      {constraintLines.length > 0 ? (
        <Section title={t('learn:workspace.constraints')}>
          <ul className="space-y-2">
            {constraintLines.map((line, index) => (
              <li className="flex items-start gap-2.5" key={index}>
                <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-sub/60" />
                <span className="font-mono text-[13px] leading-6">{line}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {exercise.hints.length > 0 ? (
        <Section title={t('learn:workspace.hints')}>
          <ol className="space-y-2">
            {exercise.hints.slice(0, revealed).map((hint, index) => (
              <li
                className="flex items-start gap-2.5 rounded-lg border border-border bg-canvas px-3.5 py-3"
                key={hint.position}
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
          {revealed < exercise.hints.length ? (
            // One at a time: a student who reads every hint at once has been
            // handed the answer rather than helped toward it.
            <button
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[13px] font-semibold text-sub transition-colors hover:border-brand/40 hover:text-brand"
              onClick={() => setRevealed((count) => count + 1)}
              type="button"
            >
              <Lightbulb className="size-3.5" />
              {t('learn:workspace.reveal_hint', {
                remaining: exercise.hints.length - revealed,
              })}
            </button>
          ) : null}
        </Section>
      ) : null}

      {exercise.hiddenTestCaseCount > 0 ? (
        <p className="flex items-start gap-2 rounded-lg bg-canvas px-3.5 py-2.5 text-[12.5px] leading-5 text-sub">
          <EyeOff className="mt-0.5 size-3.5 shrink-0" />
          {t('learn:workspace.hidden_count', {
            count: exercise.hiddenTestCaseCount,
          })}
        </p>
      ) : null}
    </div>
  );
}
