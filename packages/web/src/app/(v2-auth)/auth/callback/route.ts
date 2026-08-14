import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';

import { authDestination } from '@/lib/academy-access-state';
import { createServerORPCClient } from '@/lib/orpc-server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (!code) return NextResponse.redirect(new URL('/auth/login?error=callback', request.url));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) {
    return NextResponse.redirect(new URL('/auth/login?error=callback', request.url));
  }

  const cookieStore = await cookies();
  if (cookieStore.has('cove_invitation')) {
    cookieStore.delete('cove_oauth_intent');
    return NextResponse.redirect(new URL('/auth/invitation', request.url));
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
      new URL(authDestination(account), request.url),
    );
  } catch (completionError) {
    cookieStore.delete('cove_oauth_intent');
    const code = getErrorCode(completionError);
    if (code === 'OAUTH_ONBOARDING_INTENT_REQUIRED' ||
        code === 'OAUTH_ONBOARDING_INTENT_EXPIRED') {
      return NextResponse.redirect(
        new URL('/auth/signup?error=academy-required', request.url),
      );
    }
    if (code === 'IDENTITY_LINK_CONFLICT') {
      return NextResponse.redirect(
        new URL('/auth/login?error=identity-conflict', request.url),
      );
    }
    return NextResponse.redirect(new URL('/auth/signup?error=oauth', request.url));
  }
}

function clientAddress(request: NextRequest): string | undefined {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    undefined
  );
}

function getErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }
  return typeof error.code === 'string' ? error.code : null;
}
