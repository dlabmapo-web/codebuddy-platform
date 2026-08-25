'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SocialAuthProvider } from '@cove/shared';

import { startSocialAuthAction } from '../actions';

import { availableSocialProviders } from './social-providers';

/**
 * The row is sized to what it renders. Tailwind needs the whole class name in
 * the source, so the counts Cove can actually offer are spelled out; anything
 * wider than three wraps rather than shrinking each target below a thumb.
 */
const columnsForCount: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
};

/** Ring spinner shown while a provider redirect is being negotiated. */
function Spinner() {
  return (
    <svg aria-hidden className="h-5 w-5 animate-spin text-brand" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-20" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" />
      <path className="opacity-90" d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" />
    </svg>
  );
}

export function SocialLoginButtons({
  requestedAcademyId,
  academyRequired = false,
}: {
  requestedAcademyId?: string;
  academyRequired?: boolean;
}) {
  const { t } = useTranslation('auth');
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<string>();
  const providers = availableSocialProviders();

  async function signIn(provider: SocialAuthProvider) {
    if (academyRequired && !requestedAcademyId) {
      setError(t('error.social_choose_academy'));
      document.getElementById('academyId')?.focus();
      return;
    }

    setPending(provider);
    setError(undefined);
    const result = await startSocialAuthAction({
      provider,
      academyId: requestedAcademyId,
    });
    if (result.message) {
      setPending(undefined);
      setError(result.message);
    }
  }

  if (providers.length === 0) return null;

  return (
    <div>
      <div
        className={`grid gap-3 ${columnsForCount[providers.length] ?? 'grid-cols-3'}`}
      >
        {providers.map(({ id, label, Icon }) => {
          const isPending = pending === id;
          const isBusy = Boolean(pending);
          return (
            <button
              aria-busy={isPending}
              aria-label={
                isPending
                  ? t('social.connecting_to', { provider: label })
                  : t('social.continue_with', { provider: label })
              }
              className={[
                'flex h-14 items-center justify-center gap-2.5 rounded-xl border bg-card text-[15px] font-semibold text-ink transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed',
                isPending
                  ? 'border-brand/40 ring-2 ring-brand/15'
                  : 'border-border hover:border-ink/25 hover:bg-surface',
                isBusy && !isPending ? 'opacity-40' : '',
              ].join(' ')}
              disabled={isBusy}
              key={id}
              onClick={() => void signIn(id)}
              type="button"
            >
              {isPending ? (
                <>
                  <Spinner />
                  <span className="hidden text-brand sm:inline">
                    {t('social.connecting')}
                  </span>
                </>
              ) : (
                <>
                  <Icon className="h-6 w-6" />
                  <span className="hidden sm:inline">{label}</span>
                </>
              )}
            </button>
          );
        })}
      </div>
      {error ? (
        <p aria-live="polite" className="mt-3 text-[14px] text-danger" role="status">
          {error}
        </p>
      ) : null}
    </div>
  );
}
