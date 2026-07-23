'use client';

import type { Provider } from '@supabase/supabase-js';
import { useState } from 'react';

import { publicConfig } from '@/lib/config';
import { createClient } from '@/lib/supabase/client';

import { GoogleIcon, KakaoIcon, NaverIcon } from './provider-icons';

const providers = [
  { id: 'google', label: 'Google', Icon: GoogleIcon },
  { id: 'kakao', label: 'Kakao', Icon: KakaoIcon },
  { id: 'custom:naver', label: 'Naver', Icon: NaverIcon },
] as const;

/** Ring spinner shown while a provider redirect is being negotiated. */
function Spinner() {
  return (
    <svg aria-hidden className="h-5 w-5 animate-spin text-brand" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-20" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" />
      <path className="opacity-90" d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" />
    </svg>
  );
}

export function SocialLoginButtons() {
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<string>();

  async function signIn(provider: (typeof providers)[number]['id']) {
    setPending(provider);
    setError(undefined);
    const { error: oauthError } = await createClient().auth.signInWithOAuth({
      provider: provider as Provider,
      options: { redirectTo: `${publicConfig.siteUrl}/auth/callback` },
    });
    // On success the browser redirects to the provider, so the pending state
    // persists until the page unloads. Only reset it when the call fails.
    if (oauthError) {
      setPending(undefined);
      setError('This sign-in provider is not available yet.');
    }
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-3">
        {providers.map(({ id, label, Icon }) => {
          const isPending = pending === id;
          const isBusy = Boolean(pending);
          return (
            <button
              aria-busy={isPending}
              aria-label={isPending ? `Connecting to ${label}` : `Continue with ${label}`}
              className={[
                'flex h-14 items-center justify-center gap-2.5 rounded-xl border bg-white text-[15px] font-semibold text-ink transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed',
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
                  <span className="hidden text-brand sm:inline">Connecting…</span>
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
      {error ? <p className="mt-3 text-[14px] text-danger">{error}</p> : null}
    </div>
  );
}
