'use client';

import { logoutAction } from '../actions';

export function SignOutControl({
  className = 'text-sm font-semibold text-sub hover:text-ink',
  label = 'Sign out',
}: {
  className?: string;
  label?: string;
}) {
  return (
    <form action={logoutAction}>
      <button className={className} type="submit">{label}</button>
    </form>
  );
}
