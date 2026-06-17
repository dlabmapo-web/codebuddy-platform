import { HTMLAttributes } from 'react';

type BadgeVariant = 'default' | 'success' | 'danger' | 'warning' | 'primary';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const styles: Record<BadgeVariant, string> = {
  default: 'bg-surface text-sub',
  primary: 'bg-primary-light text-primary',
  success: 'bg-green-50 text-success',
  danger: 'bg-red-50 text-danger',
  warning: 'bg-amber-50 text-warning',
};

export function Badge({ variant = 'default', className = '', children, ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[12px] font-medium ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
