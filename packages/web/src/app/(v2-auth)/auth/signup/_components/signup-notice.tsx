import { useTranslation } from 'react-i18next';

export function SignupNotice() {
  const { t } = useTranslation('auth');

  return (
    <div className="mt-5 flex gap-3 rounded-xl border border-border bg-canvas px-4 py-3.5 text-[14px] leading-6 text-sub">
      <svg
        aria-hidden
        className="mt-0.5 h-5 w-5 shrink-0 text-brand"
        fill="none"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="12" cy="12" fill="currentColor" opacity="0.12" r="10" />
        <circle cx="12" cy="8" fill="currentColor" r="1.25" />
        <path
          d="M12 11.5v5"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.8"
        />
      </svg>
      <p>{t('signup.role_notice')}</p>
    </div>
  );
}
