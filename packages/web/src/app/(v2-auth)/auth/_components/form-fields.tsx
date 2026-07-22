'use client';

import { Eye, EyeOff, Lock, type LucideIcon } from 'lucide-react';
import { useId, useState } from 'react';

const baseInput =
  'h-14 w-full rounded-xl border border-border bg-white text-[16px] text-ink placeholder:text-sub/50 transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20';

const labelClass = 'mb-2 block text-[15px] font-semibold text-ink';
const iconClass = 'pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sub';

export function TextField({
  label,
  name,
  type = 'text',
  autoComplete,
  placeholder,
  required,
  icon: Icon,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  icon?: LucideIcon;
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
          autoComplete={autoComplete}
          className={`${baseInput} ${Icon ? 'pl-12' : 'px-4'} pr-4`}
          id={id}
          name={name}
          placeholder={placeholder}
          required={required}
          type={type}
        />
      </div>
    </div>
  );
}

export function PasswordField({
  label = 'Password',
  name = 'password',
  autoComplete = 'current-password',
  hint,
  minLength,
}: {
  label?: string;
  name?: string;
  autoComplete?: string;
  hint?: string;
  minLength?: number;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div>
      {label ? (
        <label className={labelClass} htmlFor={id}>
          {label}
        </label>
      ) : null}
      <div className="relative">
        <Lock className={iconClass} size={20} strokeWidth={1.75} />
        <input
          aria-label={label || 'Password'}
          autoComplete={autoComplete}
          className={`${baseInput} pl-12 pr-12`}
          id={id}
          minLength={minLength}
          name={name}
          placeholder="••••••••"
          required
          type={visible ? 'text' : 'password'}
        />
        <button
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-sub transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
          onClick={() => setVisible((v) => !v)}
          tabIndex={-1}
          type="button"
        >
          {visible ? <EyeOff size={20} strokeWidth={1.75} /> : <Eye size={20} strokeWidth={1.75} />}
        </button>
      </div>
      {hint ? <p className="mt-2 text-[14px] leading-5 text-sub">{hint}</p> : null}
    </div>
  );
}
