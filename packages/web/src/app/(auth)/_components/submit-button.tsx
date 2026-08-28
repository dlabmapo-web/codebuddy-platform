'use client';

import type { LucideIcon } from 'lucide-react';

import { AuthBusyOverlay } from './busy-overlay';

const heights = {
  lg: 'h-14 text-[17px]',
  md: 'h-12 text-[16px]',
  sm: 'h-11 text-[15px]',
} as const;

/**
 * The submit control on every signed-out form.
 *
 * Three things it does that a plain `<button disabled={pending}>` did not.
 *
 * It stays focusable while busy. A focused element that becomes `disabled`
 * hands focus back to the document body in every major browser, which drops a
 * keyboard reader out of the form at the exact moment the form is telling them
 * something. `aria-disabled` says the same thing to assistive technology
 * without moving anybody, and the caller's `begin()` refuses the second press
 * that this leaves possible.
 *
 * It says what is happening rather than only that something is. `busyLabel` is
 * the verb in progress — "Signing in…", "Creating account…" — and it is the
 * screen reader's announcement, since the overlay below is `aria-hidden`.
 *
 * And the spinner is not on the button. Submitting one of these forms is not a
 * control doing something, it is the screen on its way to being replaced, so
 * the ring belongs to the page: `AuthBusyOverlay` renders alongside. The button
 * keeps the label and the semantics, and holds its size — both states are
 * centred inside the same fixed height, so nothing reflows behind the wash.
 *
 * `disabled` is kept for preconditions only — a captcha not yet solved, an
 * academy not yet chosen. Those are states where the control genuinely cannot
 * be used yet, as opposed to one that is busy using itself.
 */
export function AuthSubmitButton({
  busy,
  busyLabel,
  children,
  className = '',
  disabled = false,
  icon: Icon,
  size = 'lg',
}: {
  busy: boolean;
  /** The action in progress, as a verb: "Signing in…". */
  busyLabel: string;
  children: React.ReactNode;
  className?: string;
  /** A precondition that is not met yet — never the busy state. */
  disabled?: boolean;
  icon?: LucideIcon;
  size?: keyof typeof heights;
}) {
  return (
    <>
      <button
        aria-busy={busy}
        aria-disabled={busy || disabled}
        className={[
          'flex w-full items-center justify-center gap-2.5 rounded-xl bg-brand font-bold text-on-brand',
          'transition-[background-color,opacity] duration-200 motion-reduce:transition-none',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
          heights[size],
          busy
            ? 'cursor-progress'
            : 'hover:bg-brand-deep aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
          className,
        ].join(' ')}
        disabled={disabled}
        type="submit"
      >
        {busy ? (
          busyLabel
        ) : (
          <>
            {Icon ? <Icon aria-hidden size={20} strokeWidth={2} /> : null}
            {children}
          </>
        )}
      </button>
      {busy ? <AuthBusyOverlay label={busyLabel} /> : null}
    </>
  );
}
