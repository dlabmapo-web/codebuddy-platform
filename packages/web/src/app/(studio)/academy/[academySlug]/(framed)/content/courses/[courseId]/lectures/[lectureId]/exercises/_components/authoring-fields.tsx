import { FileUp, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useId, useMemo, useRef } from 'react';

import { useTranslation } from 'react-i18next';
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
  /*
   * `label` wraps a form control; `group` wraps anything that is not one.
   *
   * A `<label>` around a rich text editor or a radiogroup is not merely
   * imprecise: clicking inside it sends the browser looking for the control
   * the label belongs to, and the click never reaches the editor. Typing was
   * impossible until a toolbar button focused it explicitly, which is what
   * every toolbar button happens to do.
   */
  as = 'label',
}: {
  label: string;
  required?: boolean;
  error?: string | null;
  children: ReactNode;
  as?: 'label' | 'group';
}) {
  const { t } = useTranslation('content');
  const labelId = useId();
  const caption = (
    <span className="text-[14px] font-bold" id={as === 'group' ? labelId : undefined}>
      {label}
      {required ? (
        <span className="ml-1 text-danger">{t('exercise.required_mark')}</span>
      ) : null}
    </span>
  );
  const message = error ? (
    <span className="text-[13.5px] font-semibold text-danger">{error}</span>
  ) : null;

  if (as === 'group') {
    return (
      <div aria-labelledby={labelId} className="grid gap-1.5" role="group">
        {caption}
        {children}
        {message}
      </div>
    );
  }

  return (
    <label className="grid gap-1.5">
      {caption}
      {children}
      {message}
    </label>
  );
}

/** Red ring on the offending input, so the error and its cause read together. */
export function invalidClass(error?: string | null) {
  return error ? 'border-danger focus:border-danger focus:ring-danger/20' : '';
}

/**
 * A test case's input or expected output.
 *
 * No length cap: a test is as long as the problem needs (a large hidden test
 * is often 100,000 numbers and more than 500 KB). The browser's `maxLength`
 * used to stop it at 100,000 characters without a word, so a pasted input was
 * cut and every correct solution failed that test. With `file`, its size shows
 * under it, so a cut input is visible, and a .txt test file can be loaded
 * whole instead of copied from a page that shows only its beginning.
 */
export function TextAreaField({
  label,
  value,
  onChange,
  disabled,
  dark,
  file,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  dark: boolean;
  /** Test data: the size line and a button that loads a text file into the field. */
  file?: { load: string; size: (characters: number, lines: number) => string };
}) {
  const picker = useRef<HTMLInputElement>(null);
  const lines = useMemo(() => lineCount(value), [value]);
  return (
    <div className="space-y-1.5">
      <Field label={label}>
        <textarea
          className={`min-h-28 w-full resize-y rounded-lg border px-3 py-2.5 font-mono text-[14px] outline-none transition-colors disabled:opacity-60 ${
            dark
              ? 'border-[#2d2d2d] bg-[#1e1e1e] text-[#d4d4d4] focus:border-brand'
              : 'border-border bg-card text-ink focus:border-brand focus:ring-2 focus:ring-brand/20'
          }`}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          value={value}
        />
      </Field>
      {file ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-sub">
          <span className="tabular-nums" data-testid="test-data-size">{file.size(value.length, lines)}</span>
          <button
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold text-brand hover:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-50"
            data-testid="test-data-load"
            disabled={disabled}
            onClick={() => picker.current?.click()}
            type="button"
          >
            <FileUp aria-hidden className="size-3.5" />{file.load}
          </button>
          <input
            accept=".txt,.in,.out,.ans,text/plain"
            aria-label={`${label}: ${file.load}`}
            className="hidden"
            onChange={async (event) => {
              const chosen = event.target.files?.[0];
              // The same file may be chosen again after an edit.
              event.target.value = '';
              if (chosen) onChange(testFileText(await chosen.text()));
            }}
            ref={picker}
            type="file"
          />
        </div>
      ) : null}
    </div>
  );
}

/** A test file as the grader reads it: Windows line ends become \n, and a leading byte-order mark goes. */
export function testFileText(text: string): string {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

/** Lines as a person counts them: a final line break does not start another. */
export function lineCount(text: string): number {
  if (!text) return 0;
  let breaks = 0;
  for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1)) breaks += 1;
  return text.endsWith('\n') ? breaks : breaks + 1;
}
