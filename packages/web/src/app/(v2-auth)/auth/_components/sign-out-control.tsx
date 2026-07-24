'use client';

import { useLayoutTranslation } from '@/i18n';

import { logoutAction } from '../actions';

export function SignOutControl({
  className = 'text-sm font-semibold text-sub hover:text-ink',
  formClassName,
  label,
}: {
  className?: string;
  formClassName?: string;
  label?: React.ReactNode;
}) {
  const { t } = useLayoutTranslation('common');
  return (
    <form action={logoutAction} className={formClassName}>
      <button className={className} type="submit">
        {label ?? t('action.sign_out')}
      </button>
    </form>
  );
}
