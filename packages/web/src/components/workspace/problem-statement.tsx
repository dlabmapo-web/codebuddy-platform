'use client';

import type { LearnExercise, LearnHint } from '@cove/shared';
import { EyeOff, Lightbulb } from 'lucide-react';
import * as React from 'react';

import { RichTextFrame } from '@/components/studio/rich-text-frame';
import { useLayoutTranslation } from '@/i18n';

import { ExampleCard } from './example-card';

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

export function ProblemStatement({
  exercise,
  hintsExpanded = true,
  onHintsExpandedChange,
  revealedHints,
  onRevealHint,
}: {
  exercise: LearnExercise;
  /** Student-owned visibility. Teachers omit it and always see every hint. */
  hintsExpanded?: boolean;
  onHintsExpandedChange?: (expanded: boolean) => void;
  /** Owned by the workspace, so navigation can reset it in one place. */
  revealedHints: number;
  /**
   * Present only on the student surface. Its absence is what tells this
   * component to render the requested hints without offering more — the
   * teacher is reading the statement, not working through it.
   */
  onRevealHint?: () => void;
}) {
  const { t } = useLayoutTranslation(['learn', 'content']);

  const constraintLines = exercise.constraints
    .split('\n')
    .map((line) => line.replace(/^[•·-]\s*/, '').trim())
    .filter(Boolean);
  const hasFormat =
    exercise.inputFormat.trim().length > 0 ||
    exercise.outputFormat.trim().length > 0;
  const hasDescription = exercise.description.trim().length > 0;

  return (
    <div
      className="max-w-full min-w-0 space-y-7 overflow-x-hidden px-5 py-5"
      data-testid="problem-statement"
    >
      {hasDescription ? (
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
          <dl className="grid min-w-0 gap-4 @md:grid-cols-2">
            {exercise.inputFormat.trim() ? (
              <div className="min-w-0 rounded-lg border border-border px-4 py-3">
                <dt className="text-[12px] font-bold text-sub">
                  {t('learn:workspace.input')}
                </dt>
                <dd className="mt-1 whitespace-pre-wrap text-[14px] leading-6">
                  {exercise.inputFormat}
                </dd>
              </div>
            ) : null}
            {exercise.outputFormat.trim() ? (
              <div className="min-w-0 rounded-lg border border-border px-4 py-3">
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
              <ExampleCard
                index={index}
                key={testCase.position}
                testCase={testCase}
              />
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

      {exercise.hiddenTestCaseCount > 0 ? (
        <p className="flex items-start gap-2 rounded-lg bg-canvas px-3.5 py-2.5 text-[12.5px] leading-5 text-sub">
          <EyeOff className="mt-0.5 size-3.5 shrink-0" />
          {t('learn:workspace.hidden_count', {
            count: exercise.hiddenTestCaseCount,
          })}
        </p>
      ) : null}

      <HintReveal
        hints={exercise.hints}
        expanded={hintsExpanded}
        onExpandedChange={onHintsExpandedChange}
        onRevealHint={onRevealHint}
        revealedHints={revealedHints}
      />
    </div>
  );
}

/**
 * Help, offered where the problem is read.
 *
 * One button, one hint. The revealed cards hang off a thread that starts at the
 * lightbulb, so a student who asked twice can see at a glance that two answers
 * came back and in what order — and everything stays in the statement's flow.
 * Nothing here covers the editor, dims the page, or has to be dismissed before
 * work can continue.
 */
function HintReveal({
  expanded,
  hints,
  onExpandedChange,
  onRevealHint,
  revealedHints,
}: {
  expanded: boolean;
  hints: readonly LearnHint[];
  onExpandedChange?: (expanded: boolean) => void;
  onRevealHint?: () => void;
  revealedHints: number;
}) {
  const { t } = useLayoutTranslation('learn');
  const finalCardRef = React.useRef<HTMLLIElement>(null);
  const visibilityButtonRef = React.useRef<HTMLButtonElement>(null);
  const previousRevealed = React.useRef(revealedHints);
  const previousExpanded = React.useRef(expanded);
  const hintListId = React.useId();

  const revealed = Math.min(Math.max(revealedHints, 0), hints.length);
  const remaining = hints.length - revealed;
  const canReveal = expanded && Boolean(onRevealHint) && remaining > 0;
  const canToggle = Boolean(onExpandedChange) && revealed > 0;
  const newestHint = onRevealHint && revealed > 0 ? hints[revealed - 1] : null;
  const announcement = newestHint
    ? t('workspace.hint_revealed', {
        number: revealed,
        content: newestHint.content,
      })
    : '';

  React.useEffect(() => {
    const grew = revealed > previousRevealed.current;
    previousRevealed.current = revealed;
    // The last activation takes the button away with it. Without this the
    // caret falls back to <body> and a keyboard reader loses both the hint it
    // just asked for and its place in the statement.
    if (grew && onRevealHint && remaining === 0) finalCardRef.current?.focus();
  }, [onRevealHint, remaining, revealed]);

  React.useEffect(() => {
    const changed = expanded !== previousExpanded.current;
    previousExpanded.current = expanded;
    if (changed && canToggle) visibilityButtonRef.current?.focus();
  }, [canToggle, expanded]);

  if (hints.length === 0 || (revealed === 0 && !canReveal)) return null;

  return (
    <div>
      {/* Mounted before the first reveal so assistive technology observes a
          change inside an existing live region, including for Hint 1. */}
      <span
        aria-atomic="true"
        aria-live="polite"
        className="sr-only"
        data-testid="hint-announcement"
      >
        {announcement}
      </span>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-brand-soft">
          <Lightbulb aria-hidden className="size-3.5 text-brand" />
        </span>
        {/* Secondary to the statement: the button is what has to be
            unmistakable, not the sentence introducing it. */}
        <span className="text-[13px] font-semibold text-sub">
          {!expanded && revealed > 0
            ? t('workspace.revealed_hint_count', { count: revealed })
            : canReveal
              ? t('workspace.need_help')
              : t('workspace.hints')}
        </span>
        <div className="flex shrink-0 flex-wrap items-center gap-2 @sm:ml-auto">
          {canReveal ? (
            <button
              className="inline-flex h-8 w-auto shrink-0 items-center justify-center rounded-lg border border-brand/25 bg-brand-soft px-3 text-[13px] font-bold text-brand transition-colors hover:border-brand hover:bg-brand hover:text-on-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              data-testid="reveal-hint"
              onClick={onRevealHint}
              type="button"
            >
              {/* `count` and not a plainer name: it is what selects the plural
                  form, so English and Korean each get a whole authored string
                  rather than a sentence assembled here. */}
              {t('workspace.reveal_hint', { count: remaining })}
            </button>
          ) : null}
          {canToggle ? (
            <button
              aria-controls={hintListId}
              aria-expanded={expanded}
              className="inline-flex h-8 w-auto shrink-0 items-center justify-center rounded-lg px-2.5 text-[13px] font-semibold text-sub transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              data-testid="toggle-hints"
              onClick={() => onExpandedChange?.(!expanded)}
              ref={visibilityButtonRef}
              type="button"
            >
              {t(expanded ? 'workspace.hide_hints' : 'workspace.show_hints')}
            </button>
          ) : null}
        </div>
      </div>

      {/* Always mounted so aria-controls names a real region even while its
          revealed cards are collapsed. */}
      <div id={hintListId}>
        {expanded && revealed > 0 ? (
          <ol className="relative mt-2.5 space-y-2 pl-[34px] before:absolute before:-top-2.5 before:bottom-4 before:left-[10px] before:w-px before:bg-brand/20 before:content-['']">
            {hints.slice(0, revealed).map((hint, index) => {
              const isFinal = index === revealed - 1;
              return (
                <li
                  className={`relative rounded-lg border border-border bg-card px-3.5 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
                    isFinal && onRevealHint ? 'cove-hint-in' : ''
                  }`}
                  // Positions come from the authored order, but a malformed
                  // payload must not collapse two cards into one key.
                  key={`${hint.position}-${index}`}
                  ref={isFinal ? finalCardRef : undefined}
                  tabIndex={-1}
                >
                  <span
                    aria-hidden
                    className="absolute -left-[34px] top-3 grid size-[21px] place-items-center rounded-full bg-brand-soft text-[11px] font-bold text-brand ring-4 ring-white"
                  >
                    {index + 1}
                  </span>
                  {/* The number is a marker, not a label. Readers get the words. */}
                  <span className="sr-only">
                    {t('workspace.hint_n', { number: index + 1 })}
                  </span>
                  <p className="whitespace-pre-wrap text-[14px] leading-6">
                    {hint.content}
                  </p>
                </li>
              );
            })}
          </ol>
        ) : null}
      </div>
    </div>
  );
}
