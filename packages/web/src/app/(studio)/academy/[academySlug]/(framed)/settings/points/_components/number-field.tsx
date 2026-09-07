'use client';

import { Minus, Plus } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * A number a manager changes by hand or by one press.
 *
 * The browser's own spinner was the wrong control here. Its arrows are four
 * pixels tall, they appear on hover and vanish otherwise, and on a page whose
 * whole content is seventeen numbers that means seventeen invisible controls.
 * A minus and a plus at the size of a real button say what they do, can be
 * hit, and read the same in both themes.
 *
 * The native spinner is hidden rather than replaced: the input is still
 * `type="number"`, so arrow keys, a numeric keypad on a phone and the
 * browser's own validation all keep working. Only the tiny arrows go.
 *
 * `step` is per field rather than always 1, because the units are not
 * comparable — nudging a course completion by 1 of 150 is a rounding error,
 * and nudging a grace period by 1 of 15 minutes is a decision.
 */
export function NumberField({
  changed,
  disabled,
  invalid,
  label,
  max,
  min,
  onChange,
  step = 1,
  unit,
  value,
}: {
  /** Edited since the last save, and not yet sent. */
  changed?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  /** Named for assistive tech, since the visible label is the row's. */
  label: string;
  max: number;
  min: number;
  onChange: (next: string) => void;
  step?: number;
  unit: string;
  value: string;
}) {
  const current = Number(value);
  const stepBy = (direction: 1 | -1) => {
    // An unreadable box steps from the floor rather than from `NaN`, so the
    // first press after clearing a field puts a number back in it.
    const from = Number.isFinite(current) ? current : min;
    const next = Math.min(max, Math.max(min, from + direction * step));
    onChange(String(next));
  };

  return (
    <span className="flex shrink-0 items-center gap-2.5">
      <span
        className={cn(
          'inline-flex items-stretch overflow-hidden rounded-lg border bg-card transition-colors',
          invalid
            ? 'border-danger'
            : changed
              ? 'border-draft'
              : 'border-border focus-within:border-brand',
        )}
      >
        <StepButton
          disabled={disabled || (Number.isFinite(current) && current <= min)}
          icon={Minus}
          label={`${label} −`}
          onClick={() => stepBy(-1)}
        />
        <input
          aria-invalid={invalid || undefined}
          aria-label={label}
          className={cn(
            'w-16 border-x border-border bg-card px-1 text-center text-[15px] font-bold tabular-nums text-ink outline-none',
            // The arrows go; the input stays a number input.
            '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
          disabled={disabled}
          inputMode="numeric"
          max={max}
          min={min}
          onChange={(event) => onChange(event.target.value)}
          type="number"
          value={value}
        />
        <StepButton
          disabled={disabled || (Number.isFinite(current) && current >= max)}
          icon={Plus}
          label={`${label} +`}
          onClick={() => stepBy(1)}
        />
      </span>
      <span className="min-w-[3.75rem] text-[13px] font-semibold text-sub">
        {unit}
      </span>
    </span>
  );
}

function StepButton({
  disabled,
  icon: Icon,
  label,
  onClick,
}: {
  disabled?: boolean;
  icon: typeof Minus;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="grid w-9 place-items-center text-sub transition-colors hover:bg-accent hover:text-ink focus-visible:bg-accent focus-visible:text-ink focus-visible:outline-none disabled:pointer-events-none disabled:opacity-35"
      disabled={disabled}
      onClick={onClick}
      tabIndex={-1}
      type="button"
    >
      <Icon aria-hidden className="size-4" strokeWidth={2.5} />
    </button>
  );
}
