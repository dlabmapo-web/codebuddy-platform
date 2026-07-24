'use client';

import { logoutAction } from '../actions';

export function SignOutControl({
  className = 'text-sm font-semibold text-sub hover:text-ink',
  formClassName,
  label = 'Sign out',
}: {
  className?: string;
  formClassName?: string;
  label?: React.ReactNode;
}) {
  return (
    <form action={logoutAction} className={formClassName}>
      <button className={className} type="submit">{label}</button>
    </form>
  );
}
