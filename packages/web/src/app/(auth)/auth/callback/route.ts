import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';

import { authDestination } from '@/lib/academy-access-state';
import { publicConfig } from '@/lib/config';
import { createServerORPCClient } from '@/lib/orpc-server';
import { createClient } from '@/lib/supabase/server';

// Redirects resolve against the public site URL, never `request.url`. The
// standalone server binds 0.0.0.0:3000, so behind Caddy `request.url` is the
// container's internal address and every redirect would send the browser to
// http://0.0.0.0:3000/... Only dev, where the two coincide, hides this.
export async function GET(request: NextRequest) {
  // A visitor who closed the provider's consent screen comes back with an
  // error and no code. That is a choice they made, not a fault in Cove, and
  // answering it with "sign-in could not be completed" told them something had
  // gone wrong when nothing had.
  const providerError = request.nextUrl.searchParams.get('error');
  if (providerError) {
    return NextResponse.redirect(
      new URL(
        providerError === 'access_denied' ? '/login' : '/login?error=callback',
        publicConfig.siteUrl,
      ),
    );
  }

  const code = request.nextUrl.searchParams.get('code');
  if (!code) return NextResponse.redirect(new URL('/login?error=callback', publicConfig.siteUrl));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) {
    return NextResponse.redirect(new URL('/login?error=callback', publicConfig.siteUrl));
  }

  const cookieStore = await cookies();
  if (cookieStore.has('cove_invitation')) {
    cookieStore.delete('cove_oauth_intent');
    return NextResponse.redirect(new URL('/invite', publicConfig.siteUrl));
  }

  const intentToken = cookieStore.get('cove_oauth_intent')?.value;
  try {
    const account = await createServerORPCClient(data.session.access_token)
      .auth.completeOAuthOnboarding({
        ...(intentToken ? { intentToken } : {}),
      });
    await createServerORPCClient(
      data.session.access_token,
      clientAddress(request),
    ).studentSession.begin({});
    cookieStore.delete('cove_oauth_intent');

    return NextResponse.redirect(
      new URL(authDestination(account), publicConfig.siteUrl),
    );
  } catch (completionError) {
    cookieStore.delete('cove_oauth_intent');
    // The session has to go before the redirect, and this is the whole of the
    // fix for a visitor who pressed Google on the login page without ever
    // signing up. `exchangeCodeForSession` above succeeded, so they hold a
    // valid Supabase session with no Cove account behind it — and `/signup`
    // calls `auth.me`, which falls through to `bootstrap`, which creates the
    // very account this branch just refused to create. They were then sent to
    // `/welcome` with no academy and no way forward, and a later proper signup
    // was rejected as "already registered" for an account they never made.
    //
    // Signed out, they arrive at `/signup` as the new visitor they actually
    // are, and the panel there tells them so.
    await supabase.auth.signOut();
    const code = getErrorCode(completionError);
    if (code === 'OAUTH_ONBOARDING_INTENT_REQUIRED') {
      // Raised from the no-existing-user branch: authenticated by a provider,
      // with no Cove account. Its own reason, because "choose an academy
      // first" describes the expired-intent case and misdescribes this one.
      return NextResponse.redirect(
        new URL(
          `/signup?error=no-account${providerQuery(data.session.user.app_metadata)}`,
          publicConfig.siteUrl,
        ),
      );
    }
    if (code === 'OAUTH_ONBOARDING_INTENT_EXPIRED') {
      return NextResponse.redirect(
        new URL('/signup?error=academy-required', publicConfig.siteUrl),
      );
    }
    if (code === 'IDENTITY_LINK_CONFLICT') {
      return NextResponse.redirect(
        new URL('/login?error=identity-conflict', publicConfig.siteUrl),
      );
    }
    return NextResponse.redirect(new URL('/signup?error=oauth', publicConfig.siteUrl));
  }
}

function clientAddress(request: NextRequest): string | undefined {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    undefined
  );
}

/**
 * The provider this visitor just used, for the panel that names it.
 *
 * Read from Supabase's app metadata rather than from a cookie, so it survives
 * the intent cookie being dropped and describes the identity that actually
 * authenticated. Allow-listed to the providers Cove offers: this value ends up
 * in a query string that a page reads back, and an arbitrary one from a token
 * has no business being rendered.
 */
function providerQuery(metadata: unknown): string {
  const provider =
    typeof metadata === 'object' && metadata !== null && 'provider' in metadata
      ? (metadata as { provider?: unknown }).provider
      : null;
  return typeof provider === 'string' &&
      (['google', 'naver', 'kakao'] as const).includes(
        provider as 'google' | 'naver' | 'kakao',
      )
    ? `&provider=${provider}`
    : '';
}

function getErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }
  return typeof error.code === 'string' ? error.code : null;
}
