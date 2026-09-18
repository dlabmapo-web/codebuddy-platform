'use client';

import { Minus, Plus } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { parseNumberField, stepNumberField } from './number-field-value';

/** Keeps the author's decimal draft intact while the parent owns saved values. */
export function NumberField({ label, value, onChange, min, max, step = 1, precision = 0, optional = false, disabled = false, unit, placeholder }: {
  label: string; value: number | null; onChange: (value: number | null) => void;
  min: number; max: number; step?: number; precision?: number; optional?: boolean;
  disabled?: boolean; unit?: string; placeholder?: string;
}) {
  const { t } = useTranslation('content');
  const id = useId();
  const format = (next: number | null) => next === null || !Number.isFinite(next) ? '' : String(next);
  const [text, setText] = useState(() => format(value));
  const [reported, setReported] = useState(value);
  // A server refresh or mode change replaces the draft; our own updates do not
  // erase a trailing decimal point or a temporarily invalid entry.
  if (!Object.is(value, reported)) {
    setReported(value);
    setText(format(value));
  }
  const parsed = parseNumberField(text, min, max, precision, optional);
  const invalid = Number.isNaN(parsed);
  function edit(next: string) {
    const number = parseNumberField(next, min, max, precision, optional);
    setText(next);
    setReported(number);
    onChange(number);
  }
  function move(direction: -1 | 1) {
    edit(String(stepNumberField(parsed, direction, step, min, max, precision)));
  }
  const buttonClass = 'grid size-9 shrink-0 place-items-center rounded-md text-sub transition-colors hover:bg-brand-soft hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-30';
  return (
    <div className="min-w-0 space-y-1.5">
      <label className="block text-[14px] font-bold" htmlFor={id}>{label}</label>
      <div className={`flex min-h-11 items-center gap-1 rounded-lg border bg-card px-1 transition-colors focus-within:ring-2 ${invalid ? 'border-danger focus-within:ring-danger/20' : 'border-border focus-within:border-brand focus-within:ring-brand/20'} ${disabled ? 'bg-canvas opacity-60' : ''}`}>
        <button aria-label={t('exercise.controls.decrease', { label })} className={buttonClass} disabled={disabled || (parsed !== null && !invalid && parsed <= min)} onClick={() => move(-1)} type="button"><Minus aria-hidden className="size-4" /></button>
        <input
          aria-describedby={`${id}-hint`} aria-invalid={invalid || undefined}
          aria-valuetext={text || t('exercise.controls.unset')} aria-valuemin={min} aria-valuemax={max} aria-valuenow={parsed !== null && !invalid ? parsed : undefined}
          className="h-10 min-w-0 w-full bg-transparent text-center text-[15px] tabular-nums text-ink outline-none placeholder:text-[12px] placeholder:text-sub disabled:cursor-not-allowed"
          disabled={disabled} id={id} inputMode={precision ? 'decimal' : 'numeric'} role="spinbutton"
          onChange={(event) => edit(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); move(event.key === 'ArrowUp' ? 1 : -1); } }}
          placeholder={placeholder ?? (optional ? t('exercise.controls.unset') : undefined)} type="text" value={text}
        />
        {unit ? <span aria-hidden className="shrink-0 text-[12px] text-sub">{unit}</span> : null}
        <button aria-label={t('exercise.controls.increase', { label })} className={buttonClass} disabled={disabled || (parsed !== null && !invalid && parsed >= max)} onClick={() => move(1)} type="button"><Plus aria-hidden className="size-4" /></button>
      </div>
      <p className={`text-[12px] leading-4 ${invalid ? 'text-danger' : 'text-sub'}`} id={`${id}-hint`}>
        {t(invalid ? 'exercise.controls.invalid' : 'exercise.controls.range', { min, max, precision })}
      </p>
    </div>
  );
}
