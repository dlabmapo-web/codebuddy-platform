'use client';

import { cn } from '@/lib/utils';

/**
 * A setting that takes effect the moment it is flipped.
 *
 * Not a checkbox, and the difference is not decoration. A checkbox is a form
 * control: it says a value has been *marked* and something later will submit
 * it. These settings have no submit — each one is a request the instant it
 * moves — and a control that implies otherwise leaves a manager wondering
 * whether they still have to press something.
 *
 * `role="switch"` with `aria-checked` says the same thing to a screen reader,
 * which announces "on"/"off" rather than "checked".
 *
 * A `button` rather than a styled `input`: the track and knob are the whole
 * control, and native checkbox appearance has to be suppressed on every
 * browser before it can be replaced. Nothing is gained by keeping it
 * underneath. Callers put a `<label>` around this and the text beside it, so
 * the label still moves the switch.
 */
export function Switch({
  busy = false,
  checked,
  className,
  disabled = false,
  label,
  onCheckedChange,
}: {
  /** This one is mid-request; the rest are merely disabled while it lands. */
  busy?: boolean;
  checked: boolean;
  className?: string;
  disabled?: boolean;
  /** Read to assistive technology when no visible label is associated. */
  label?: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <button
      aria-busy={busy}
      aria-checked={checked}
      aria-label={label}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 focus-visible:ring-offset-card',
        checked ? 'bg-brand' : 'bg-accent',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        className,
      )}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      role="switch"
      type="button"
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute top-0.5 left-0.5 grid size-5 place-items-center rounded-full bg-card shadow-sm transition-transform duration-200 motion-reduce:transition-none',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      >
        {busy ? (
          // Inside the knob rather than beside the switch: the thing that is
          // working is this control, and a spinner floating next to it would
          // read as a second, unrelated status.
          <span className="cove-spinner block size-3 rounded-full border-2 border-brand/25 border-t-brand" />
        ) : null}
      </span>
    </button>
  );
}
