import { useTranslation } from 'react-i18next';

export function SignupNotice() {
  const { t } = useTranslation('auth');

  return (
    /*
     * A line, not a card. It was a bordered panel carrying two sentences that
     * the account-type hint said again further up; with the duplicate gone
     * this is the only place the role rule appears, and one muted line at the
     * foot of the form states it without spending eighty pixels on a box.
     */
    <div className="mt-4 flex gap-2.5 text-[13px] leading-5 text-sub">
      <svg
        aria-hidden
        className="mt-px h-4 w-4 shrink-0 text-brand"
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
