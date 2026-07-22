'use client';

import type { Provider } from '@supabase/supabase-js';
import { useState } from 'react';

import { publicConfig } from '@/lib/config';
import { createClient } from '@/lib/supabase/client';

const providers = [
  { id: 'google', label: 'Continue with Google' },
  { id: 'kakao', label: 'Continue with Kakao' },
  { id: 'custom:naver', label: 'Continue with Naver' },
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
      setError('This login provider is not configured yet.');
    }
  }

  return (
    <div className="space-y-2">
      {providers.map((provider) => (
        <button
          className="h-11 w-full rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          disabled={Boolean(pending)}
          key={provider.id}
          onClick={() => void signIn(provider.id)}
          type="button"
        >
          {pending === provider.id ? 'Connecting…' : provider.label}
        </button>
      ))}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
