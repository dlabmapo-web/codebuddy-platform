'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SocialAuthProvider } from '@cove/shared';

import { startSocialAuthAction } from '../actions';

import { availableSocialProviders } from './social-providers';
import { AuthBusyOverlay } from './busy-overlay';

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

  const pendingLabel = providers.find(
    (provider) => provider.id === pending,
  )?.label;

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
                'flex h-12 items-center justify-center gap-2.5 rounded-xl border bg-card text-[15px] font-semibold text-ink transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed',
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
              <Icon
                className={isPending ? 'h-6 w-6 text-brand' : 'h-6 w-6'}
              />
              <span
                className={
                  isPending
                    ? 'hidden text-brand sm:inline'
                    : 'hidden sm:inline'
                }
              >
                {isPending ? t('social.connecting') : label}
              </span>
            </button>
          );
        })}
      </div>
      {error ? (
        <p aria-live="polite" className="mt-3 text-[14px] text-danger" role="status">
          {error}
        </p>
      ) : null}
      {/*
       * The same page-level wash the password form uses. Handing off to a
       * provider is the screen leaving, exactly as signing in is, and one of
       * the two showing a full-page state while the other marked a single
       * button would make the same moment look like two different things.
       *
       * The label names the provider, which is the one thing this can say and
       * a generic "Signing in…" cannot: whose sign-in page is about to open.
       */}
      {pendingLabel ? (
        <AuthBusyOverlay
          label={t('social.connecting_to', { provider: pendingLabel })}
        />
      ) : null}
    </div>
  );
}
