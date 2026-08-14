'use client';

import { useId } from 'react';

import { Input, Textarea } from '@/components/studio/primitives';
import { cn } from '@/lib/utils';

import { chipTone } from './accent';

/**
 * The form vocabulary for both profile routes.
 *
 * Every control carries a persistent label — never a placeholder standing in
 * for one. A placeholder disappears the moment someone starts typing, which is
 * exactly when a person filling in eight fields most needs to know which one
 * they are in.
 */

export function Field({
  label,
  help,
  htmlFor,
  optional,
  children,
}: {
  label: string;
  help?: string;
  htmlFor?: string;
  optional?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label
        className="flex items-baseline gap-2 text-[13px] font-semibold text-sub"
        htmlFor={htmlFor}
      >
        {label}
        {optional ? (
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-sub/70">
            {optional}
          </span>
        ) : null}
      </label>
      {children}
      {help ? (
        <p className="text-[12.5px] leading-[1.5] text-sub/85">{help}</p>
      ) : null}
    </div>
  );
}

export function TextField({
  label,
  help,
  optional,
  value,
  onChange,
  ...props
}: {
  label: string;
  help?: string;
  optional?: string;
  value: string | null;
  onChange: (value: string) => void;
} & Omit<React.ComponentProps<'input'>, 'value' | 'onChange'>) {
  const id = useId();
  return (
    <Field help={help} htmlFor={id} label={label} optional={optional}>
      <Input
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value ?? ''}
        {...props}
      />
    </Field>
  );
}

export function TextAreaField({
  label,
  help,
  optional,
  value,
  onChange,
  maxLength,
  remainingLabel,
  ...props
}: {
  label: string;
  help?: string;
  optional?: string;
  value: string | null;
  onChange: (value: string) => void;
  maxLength: number;
  /** Rendered as the live counter. Already localized by the caller. */
  remainingLabel: (remaining: number) => string;
} & Omit<React.ComponentProps<'textarea'>, 'value' | 'onChange'>) {
  const id = useId();
  const used = (value ?? '').length;
  return (
    <Field help={help} htmlFor={id} label={label} optional={optional}>
      <Textarea
        id={id}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        value={value ?? ''}
        {...props}
      />
      <p className="text-right text-[12px] tabular text-sub/75">
        {remainingLabel(maxLength - used)}
      </p>
    </Field>
  );
}

export function SelectField<TValue extends string>({
  label,
  help,
  optional,
  value,
  onChange,
  options,
  emptyLabel,
}: {
  label: string;
  help?: string;
  optional?: string;
  value: TValue | null;
  onChange: (value: TValue | null) => void;
  options: { value: TValue; label: string }[];
  emptyLabel: string;
}) {
  const id = useId();
  return (
    <Field help={help} htmlFor={id} label={label} optional={optional}>
      <select
        className="h-10 w-full rounded-lg border border-border bg-card px-3 text-[14px] text-ink outline-none transition-colors focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20"
        id={id}
        onChange={(event) =>
          onChange((event.target.value || null) as TValue | null)}
        value={value ?? ''}
      >
        <option value="">{emptyLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/**
 * The controlled vocabularies — interests, specialties, languages — as toggle
 * chips.
 *
 * This is where the page spends its colour. Each chip keeps the same hue
 * wherever it appears, so "the violet one" becomes something a reader can
 * learn, and the label is always spelled out beside it: the colour is a
 * landmark, never the meaning.
 */
export function ChipField<TValue extends string>({
  label,
  help,
  value,
  onChange,
  options,
  limit,
  readOnly,
}: {
  label: string;
  help?: string;
  value: TValue[];
  onChange: (value: TValue[]) => void;
  options: { value: TValue; label: string }[];
  limit: number;
  readOnly?: boolean;
}) {
  const selected = new Set<string>(value);
  const atLimit = value.length >= limit;

  return (
    <fieldset className="space-y-2">
      <legend className="text-[13px] font-semibold text-sub">{label}</legend>
      <div className="flex flex-wrap gap-2 pt-1">
        {options.map((option, index) => {
          const isOn = selected.has(option.value);
          if (readOnly && !isOn) return null;
          return (
            <button
              aria-pressed={isOn}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--chip-hue)]/40',
                isOn
                  ? 'border-transparent bg-[color:var(--chip-hue)]/12 text-[color:var(--chip-hue)]'
                  : 'border-border text-sub hover:border-[color:var(--chip-hue)]/50 hover:text-ink',
                readOnly && 'pointer-events-none',
                !isOn && atLimit && 'opacity-45',
              )}
              disabled={readOnly || (!isOn && atLimit)}
              key={option.value}
              onClick={() =>
                onChange(
                  isOn
                    ? value.filter((entry) => entry !== option.value)
                    : [...value, option.value],
                )}
              style={chipTone(index)}
              type="button"
            >
              <span
                aria-hidden
                className={cn(
                  'size-1.5 rounded-full',
                  isOn ? 'bg-[color:var(--chip-hue)]' : 'bg-border',
                )}
              />
              {option.label}
            </button>
          );
        })}
      </div>
      {help ? (
        <p className="text-[12.5px] leading-[1.5] text-sub/85">{help}</p>
      ) : null}
    </fieldset>
  );
}

/** A value the reader may see and nobody on this page may change. */
export function ReadOnlyField({
  label,
  value,
  help,
  emptyLabel,
}: {
  label: string;
  value: React.ReactNode;
  help?: string;
  emptyLabel: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[13px] font-semibold text-sub">{label}</p>
      <p className="rounded-lg border border-dashed border-border bg-muted/60 px-3 py-2.5 text-[14px] text-ink">
        {value ?? <span className="text-sub">{emptyLabel}</span>}
      </p>
      {help ? (
        <p className="text-[12.5px] leading-[1.5] text-sub/85">{help}</p>
      ) : null}
    </div>
  );
}

/** Two fields side by side on a wide screen, stacked on a narrow one. */
export function FieldRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">{children}</div>
  );
}
