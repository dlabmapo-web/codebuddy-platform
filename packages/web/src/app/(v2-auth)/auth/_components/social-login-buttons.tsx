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
    if (oauthError) {
      setPending(undefined);
      setError('This sign-in provider is not available yet.');
    }
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-3">
        {providers.map(({ id, label, Icon }) => (
          <button
            aria-label={`Continue with ${label}`}
            className="flex h-14 items-center justify-center gap-2.5 rounded-xl border border-border bg-white text-[15px] font-semibold text-ink transition-colors hover:border-ink/25 hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
            disabled={Boolean(pending)}
            key={id}
            onClick={() => void signIn(id)}
            type="button"
          >
            {pending === id ? (
              <span className="font-mono text-sm text-sub">…</span>
            ) : (
              <>
                <Icon className="h-6 w-6" />
                <span className="hidden sm:inline">{label}</span>
              </>
            )}
          </button>
        ))}
      </div>
      {error ? <p className="mt-3 text-[14px] text-danger">{error}</p> : null}
    </div>
  );
}
