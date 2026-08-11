import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { useLayoutTranslation } from '@/i18n';

export const inputClass =
  'h-11 w-full rounded-lg border border-border bg-card px-3 text-[15px] outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:bg-canvas disabled:text-sub';

export const secondaryButtonClass =
  'inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 text-[14px] font-bold text-brand hover:border-brand hover:text-brand-deep';

export function SectionCard({
  title,
  description,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-card border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {Icon ? (
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
              <Icon className="size-[1.05rem]" />
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 className="text-[16.5px] font-bold tracking-[-0.01em]">{title}</h2>
            {description ? (
              <p className="mt-1 max-w-2xl text-[14px] leading-[1.55] text-sub">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

export function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string | null;
  children: ReactNode;
}) {
  const { t } = useLayoutTranslation('content');
  return (
    <label className="grid gap-1.5">
      <span className="text-[14px] font-bold">
        {label}
        {required ? (
          <span className="ml-1 text-danger">{t('exercise.required_mark')}</span>
        ) : null}
      </span>
      {children}
      {error ? (
        <span className="text-[13.5px] font-semibold text-danger">{error}</span>
      ) : null}
    </label>
  );
}

/** Red ring on the offending input, so the error and its cause read together. */
export function invalidClass(error?: string | null) {
  return error ? 'border-danger focus:border-danger focus:ring-danger/20' : '';
}

export function TextAreaField({
  label,
  value,
  onChange,
  disabled,
  dark,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  dark: boolean;
}) {
  return (
    <Field label={label}>
      <textarea
        className={`min-h-28 w-full resize-y rounded-lg border px-3 py-2.5 font-mono text-[14px] outline-none transition-colors disabled:opacity-60 ${
          dark
            ? 'border-[#2d2d2d] bg-[#1e1e1e] text-[#d4d4d4] focus:border-brand'
            : 'border-border bg-card text-ink focus:border-brand focus:ring-2 focus:ring-brand/20'
        }`}
        disabled={disabled}
        maxLength={100_000}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </Field>
  );
}
