import { InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, className = '', ...props }, ref) => (
    <div className="flex flex-col gap-1">
      <input
        ref={ref}
        className={`h-10 w-full rounded px-3 text-[14px] text-ink border transition-colors outline-none focus:border-primary placeholder:text-sub bg-card ${
          error ? 'border-danger' : 'border-border'
        } ${className}`}
        {...props}
      />
      {error && <p className="text-[12px] text-danger">{error}</p>}
    </div>
  )
);

Input.displayName = 'Input';
