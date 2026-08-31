import { NextResponse, type NextRequest } from 'next/server';

import { publicConfig } from '@/lib/config';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  // Absolute base is the public site URL: `request.url` is the standalone
  // server's internal 0.0.0.0:3000 address behind the proxy.
  const { token } = await params;
  if (token.length < 32 || token.length > 512) {
    return NextResponse.redirect(new URL('/login?error=invitation', publicConfig.siteUrl));
  }

  // One destination, signed in or not.
  //
  // This used to branch: a visitor with no session was sent to `/signup`, on
  // the assumption that somebody being invited has no account yet. That is a
  // guess, and it is wrong for exactly the people it strands — a manager who
  // already has a Cove account from another academy met a form that could only
  // reject them, with no sentence anywhere saying why. `/invite` reads the
  // invitation and offers both doors instead of choosing one for them.
  const response = NextResponse.redirect(
    new URL('/invite', publicConfig.siteUrl),
  );
  response.cookies.set('cove_invitation', token, {
    httpOnly: true,
    maxAge: 60 * 60,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  return response;
}
