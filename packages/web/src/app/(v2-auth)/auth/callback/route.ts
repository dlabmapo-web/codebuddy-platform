import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const destination = new URL('/auth/welcome', request.url);
  if (!code) return NextResponse.redirect(new URL('/auth/login?error=callback', request.url));

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL('/auth/login?error=callback', request.url));
  return NextResponse.redirect(destination);
}
