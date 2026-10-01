'use client';

import { Eye, EyeOff, Lock, type LucideIcon } from 'lucide-react';
import { useId, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

const baseInput =
  'h-12 w-full rounded-xl border border-border bg-card text-[16px] text-ink placeholder:text-sub/50 transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20';

const labelClass = 'mb-1.5 block text-[14px] font-semibold text-ink';
const iconClass = 'pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sub';

export function TextField({
  label,
  name,
  type = 'text',
  autoComplete,
  placeholder,
  required,
  icon: Icon,
  hint,
  inputRef,
  describedBy,
  value,
  onValueChange,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  icon?: LucideIcon;
  hint?: string;
  /** For moving focus to the first field a submission was rejected on. */
  inputRef?: RefObject<HTMLInputElement | null>;
  describedBy?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}) {
  const id = useId();
  return (
    <div>
      <label className={labelClass} htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        {Icon ? <Icon className={iconClass} size={20} strokeWidth={1.75} /> : null}
        <input
          aria-describedby={[describedBy, hint ? `${id}-hint` : undefined].filter(Boolean).join(' ') || undefined}
          autoComplete={autoComplete}
          className={`${baseInput} ${Icon ? 'pl-12' : 'px-4'} pr-4`}
          id={id}
          name={name}
          value={value}
          onChange={onValueChange ? (event) => onValueChange(event.target.value) : undefined}
          placeholder={placeholder}
          ref={inputRef}
          required={required}
          type={type}
        />
      </div>
      {hint ? <p className="mt-1.5 text-[13px] leading-5 text-sub" id={`${id}-hint`}>{hint}</p> : null}
    </div>
  );
}

export function PasswordField({
  label,
  name = 'password',
  autoComplete = 'current-password',
  placeholder = '••••••••',
  showIcon = true,
  hint,
  minLength,
  inputRef,
  onValueChange,
  describedBy,
  value,
}: {
  placeholder?: string;
  showIcon?: boolean;
  /** Pass '' to hide the label when the caller renders its own. */
  label?: string;
  name?: string;
  autoComplete?: string;
  hint?: string;
  minLength?: number;
  /** For moving focus to the first field a submission was rejected on. */
  inputRef?: RefObject<HTMLInputElement | null>;
  /** Set by callers that show live requirements as the password is typed. */
  onValueChange?: (value: string) => void;
  describedBy?: string;
  value?: string;
}) {
  const { t } = useTranslation('auth');
  const id = useId();
  const [visible, setVisible] = useState(false);
  const fieldLabel = label ?? t('field.password');
  return (
    <div>
      {fieldLabel ? (
        <label className={labelClass} htmlFor={id}>
          {fieldLabel}
        </label>
      ) : null}
      <div className="relative">
        {showIcon ? <Lock className={iconClass} size={20} strokeWidth={1.75} /> : null}
        <input
          aria-describedby={[describedBy, hint ? `${id}-hint` : undefined].filter(Boolean).join(' ') || undefined}
          aria-label={fieldLabel || t('field.password')}
          autoComplete={autoComplete}
          className={`${baseInput} ${showIcon ? 'pl-12' : 'pl-4'} pr-12`}
          id={id}
          minLength={minLength}
          name={name}
          value={value}
          onChange={onValueChange ? (event) => onValueChange(event.target.value) : undefined}
          placeholder={placeholder}
          ref={inputRef}
          required
          type={visible ? 'text' : 'password'}
        />
        <button
          aria-label={visible ? t('field.password_hide') : t('field.password_show')}
          aria-pressed={visible}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-sub transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
          onClick={() => setVisible((v) => !v)}
          type="button"
        >
          {visible ? <EyeOff size={20} strokeWidth={1.75} /> : <Eye size={20} strokeWidth={1.75} />}
        </button>
      </div>
      {hint ? <p className="mt-1.5 text-[13px] leading-5 text-sub" id={`${id}-hint`}>{hint}</p> : null}
    </div>
  );
}
