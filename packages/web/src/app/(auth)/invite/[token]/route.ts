import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (token.length < 32 || token.length > 512) {
    return NextResponse.redirect(new URL('/login?error=invitation', request.url));
  }

  const academyId = request.nextUrl.searchParams.get('academy');
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const destination = data?.claims
    ? new URL('/invite', request.url)
    : new URL('/signup', request.url);
  if (!data?.claims && academyId) {
    destination.searchParams.set('invited', '1');
    destination.searchParams.set('academy', academyId);
  }

  const response = NextResponse.redirect(destination);
  response.cookies.set('cove_invitation', token, {
    httpOnly: true,
    maxAge: 60 * 60,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  return response;
}
