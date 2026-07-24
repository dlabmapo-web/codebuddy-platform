import type { ReactNode } from 'react';

import { useLayoutTranslation } from '@/i18n';

export const inputClass =
  'h-10 w-full rounded-lg border border-border bg-white px-3 text-[14px] outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:bg-canvas disabled:text-sub';

export const secondaryButtonClass =
  'inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-white px-4 text-[13.5px] font-bold text-brand hover:border-brand hover:text-brand-deep';

export function SectionCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-card border border-border bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold tracking-[-0.02em]">{title}</h2>
          {description ? (
            <p className="mt-1 max-w-2xl text-[13px] leading-5 text-sub">
              {description}
            </p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

export function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  const { t } = useLayoutTranslation('content');
  return (
    <label className="grid gap-1.5">
      <span className="text-[13px] font-bold">
        {label}
        {required ? (
          <span className="ml-1 text-danger">{t('exercise.required_mark')}</span>
        ) : null}
      </span>
      {children}
    </label>
  );
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
        className={`min-h-28 w-full resize-y rounded-lg border px-3 py-2.5 font-mono text-[13px] outline-none transition-colors disabled:opacity-60 ${
          dark
            ? 'border-[#2d2d2d] bg-[#1e1e1e] text-[#d4d4d4] focus:border-brand'
            : 'border-border bg-white text-ink focus:border-brand focus:ring-2 focus:ring-brand/20'
        }`}
        disabled={disabled}
        maxLength={100_000}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </Field>
  );
}
