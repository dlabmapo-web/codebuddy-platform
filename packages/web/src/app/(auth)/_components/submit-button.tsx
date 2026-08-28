'use client';

import type { LucideIcon } from 'lucide-react';

import { Spinner } from './spinner';

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
 * the verb in progress — "Signing in…", "Creating account…" — because the
 * spinner alone cannot distinguish a slow network from a stuck form.
 *
 * And it holds its size. Both states are centred inside the same fixed height,
 * so the card behind it never reflows and the button never jumps out from
 * under a cursor that is still on it.
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
    <button
      aria-busy={busy}
      aria-disabled={busy || disabled}
      className={[
        'flex w-full items-center justify-center gap-2.5 rounded-xl bg-brand font-bold text-on-brand',
        'transition-[background-color,opacity] duration-200 motion-reduce:transition-none',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        heights[size],
        busy
          ? 'cursor-progress opacity-80'
          : 'hover:bg-brand-deep aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
        className,
      ].join(' ')}
      disabled={disabled}
      type="submit"
    >
      {busy ? (
        <>
          <Spinner size={20} />
          {busyLabel}
        </>
      ) : (
        <>
          {Icon ? <Icon aria-hidden size={20} strokeWidth={2} /> : null}
          {children}
        </>
      )}
    </button>
  );
}
