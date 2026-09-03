'use client';

import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * What a visitor sees after signing in with Google or Naver without ever
 * having signed up.
 *
 * The provider authenticated them and Cove has no account for them, which is
 * two facts and a next step — and until now they were told none of the three.
 * The callback refused the onboarding and sent them to `/signup` with a
 * message about choosing an academy, which is not what happened and not what
 * they had done wrong.
 *
 * Names the provider they actually pressed. "소셜 계정" is vaguer than the
 * button that is still on their screen behind this page.
 */
export function SocialNoAccountNotice({ provider }: { provider?: string }) {
  const { t } = useTranslation('auth');
  return (
    <div className="mb-6 flex gap-3 rounded-xl border border-brand/25 bg-brand/5 p-4">
      <Info className="mt-0.5 size-5 shrink-0 text-brand" strokeWidth={1.75} />
      <div className="min-w-0">
        <p className="text-[15px] font-bold text-ink">
          {t('social.no_account_title')}
        </p>
        <p className="mt-1 text-[14px] leading-6 text-sub">
          {provider
            ? t('social.no_account_body', { provider })
            : t('social.no_account_body_generic')}
        </p>
      </div>
    </div>
  );
}
