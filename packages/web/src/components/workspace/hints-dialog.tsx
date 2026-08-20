'use client';

import type { LearnHint } from '@cove/shared';
import { Lightbulb } from 'lucide-react';
import * as React from 'react';

import {
  Modal,
  ModalContent,
  ModalTrigger,
} from '@/components/studio/primitives';
import { useLayoutTranslation } from '@/i18n';

/**
 * Help, asked for and read in a dialog rather than in the statement.
 *
 * Hints are the one thing the two people in a live session do not both see —
 * the teacher has every hint, the student only what they have opened — and
 * while they sat in the statement they made the two copies of it different
 * heights. That is not a cosmetic difference: the statement is the box a
 * shared pointer is measured against, so a taller copy on one screen put the
 * two arrows on different lines.
 *
 * Taking the hints out of that box removes the difference at its source. What
 * remains in the statement is one control of fixed height, identical for both
 * roles whatever its label says, and the dialog itself is portaled out of
 * every collaboration surface — so a mouse over it has no shared coordinate to
 * report, which is already how the awareness layer treats a modal.
 */
export function HintsDialog({
  hints,
  onRevealHint,
  revealedHints,
}: {
  hints: readonly LearnHint[];
  /**
   * Present only on the student surface. Its absence is what tells this
   * component to show the hints without offering more — the teacher is reading
   * the statement, not working through it.
   */
  onRevealHint?: () => void;
  revealedHints: number;
}) {
  const { t } = useLayoutTranslation('learn');
  const [open, setOpen] = React.useState(false);
  const finalCardRef = React.useRef<HTMLLIElement>(null);
  const previousRevealed = React.useRef(revealedHints);

  const revealed = Math.min(Math.max(revealedHints, 0), hints.length);
  const remaining = hints.length - revealed;
  const canReveal = Boolean(onRevealHint) && remaining > 0;
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
    // caret falls back to the dialog itself and a keyboard reader loses both
    // the hint it just asked for and its place among them.
    if (grew && onRevealHint && remaining === 0) finalCardRef.current?.focus();
  }, [onRevealHint, remaining, revealed]);

  if (hints.length === 0) return null;

  return (
    <Modal onOpenChange={setOpen} open={open}>
      {/*
        Fixed height, so the statement is exactly as tall for the teacher as it
        is for the student however the label reads. The shared pointer depends
        on that; see the note above.
      */}
      <ModalTrigger
        className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-brand/25 bg-brand-soft px-3 text-[13px] font-bold text-brand transition-colors hover:border-brand hover:bg-brand hover:text-on-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        data-testid="open-hints"
        type="button"
      >
        <Lightbulb aria-hidden className="size-3.5 shrink-0" />
        <span className="whitespace-nowrap">
          {revealed > 0
            ? t('workspace.revealed_hint_count', { count: revealed })
            : t('workspace.need_help')}
        </span>
      </ModalTrigger>

      <ModalContent
        className="max-w-md"
        description={t('workspace.hints_description')}
        title={t('workspace.hints')}
      >
        {/* Mounted with the dialog and before the first reveal, so assistive
            technology observes a change inside an existing live region. */}
        <span
          aria-atomic="true"
          aria-live="polite"
          className="sr-only"
          data-testid="hint-announcement"
        >
          {announcement}
        </span>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {revealed > 0 ? (
            <ol className="relative space-y-2 pl-[34px] before:absolute before:-top-1 before:bottom-4 before:left-[10px] before:w-px before:bg-brand/20 before:content-['']">
              {hints.slice(0, revealed).map((hint, index) => (
                <li
                  className="relative rounded-lg border border-border bg-card px-3.5 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                  // Positions come from the authored order, but a malformed
                  // payload must not collapse two cards into one key.
                  key={`${hint.position}-${index}`}
                  ref={index === revealed - 1 ? finalCardRef : undefined}
                  tabIndex={-1}
                >
                  <span
                    aria-hidden
                    className="absolute -left-[34px] top-3 grid size-[21px] place-items-center rounded-full bg-brand-soft text-[11px] font-bold text-brand ring-4 ring-card"
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
              ))}
            </ol>
          ) : (
            <p className="text-[13.5px] leading-6 text-sub">
              {t('workspace.hints_none_yet')}
            </p>
          )}
        </div>

        {canReveal ? (
          <div className="shrink-0 border-t border-border px-6 py-4">
            <button
              className="inline-flex h-9 w-auto shrink-0 items-center justify-center rounded-lg border border-brand/25 bg-brand-soft px-3 text-[13px] font-bold text-brand transition-colors hover:border-brand hover:bg-brand hover:text-on-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              data-testid="reveal-hint"
              onClick={onRevealHint}
              type="button"
            >
              {/* `count` and not a plainer name: it is what selects the plural
                  form, so English and Korean each get a whole authored string
                  rather than a sentence assembled here. */}
              {t('workspace.reveal_hint', { count: remaining })}
            </button>
          </div>
        ) : null}
      </ModalContent>
    </Modal>
  );
}
