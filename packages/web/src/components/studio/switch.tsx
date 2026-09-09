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
/**
 * The hue a switch wears when it is on.
 *
 * The product already colours by subject rather than by state — each overview
 * section owns a hue, and the panel table is its legend. A grid of switches is
 * the case that needs it most: four identical blue columns are four columns a
 * reader has to check the header for, where four hues let them read an
 * academy's whole configuration as a shape.
 *
 * Complete class strings, never composed. Tailwind reads source text, so
 * `bg-${tone}` would be a class that never ships.
 */
export type SwitchTone = 'brand' | 'teal' | 'peer' | 'gold' | 'rose';

const switchTones: Record<SwitchTone, string> = {
  brand: 'bg-brand',
  teal: 'bg-teal',
  peer: 'bg-peer',
  gold: 'bg-rank-gold',
  rose: 'bg-course-d',
};

export function Switch({
  busy = false,
  checked,
  className,
  disabled = false,
  label,
  onCheckedChange,
  tone = 'brand',
}: {
  /** This one is mid-request; the rest are merely disabled while it lands. */
  busy?: boolean;
  checked: boolean;
  className?: string;
  disabled?: boolean;
  /** Read to assistive technology when no visible label is associated. */
  label?: string;
  onCheckedChange: (checked: boolean) => void;
  /** Defaults to `brand`, which is every switch outside a coloured grid. */
  tone?: SwitchTone;
}) {
  return (
    <button
      aria-busy={busy}
      aria-checked={checked}
      aria-label={label}
      className={cn(
        'group/switch relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 focus-visible:ring-offset-card',
        // The off state carries a hairline of its own. Against a white row the
        // bare track read as an empty space rather than as a control that is
        // switched off, which is the one thing it has to say.
        checked ? switchTones[tone] : 'bg-accent ring-1 ring-inset ring-border',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        className,
      )}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      data-slot="switch"
      role="switch"
      type="button"
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute top-0.5 left-0.5 grid size-5 place-items-center rounded-full bg-card shadow-sm',
          // Eased rather than linear, and the knob narrows as it travels: the
          // press should feel like a thing moving, which is the whole argument
          // for a switch over a checkbox.
          'transition-[transform,width] duration-200 ease-[cubic-bezier(0.34,1.4,0.64,1)]',
          'group-active/switch:w-6 motion-reduce:transition-none',
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
