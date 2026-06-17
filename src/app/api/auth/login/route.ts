import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { verifyPassword } from '@/lib/auth/password';
import { signToken } from '@/lib/auth/jwt';
import { COOKIE_NAME } from '@/lib/auth/session';

const COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const { username, password } = body as { username?: string; password?: string };

  if (!username || !password) {
    return NextResponse.json({ error: '아이디와 비밀번호를 입력해주세요.' }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: user, error } = await db
    .from('users')
    .select('id, username, password_hash, name, role, is_active')
    .eq('username', username)
    .maybeSingle();

  if (error || !user) {
    return NextResponse.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }
  if (!user.is_active) {
    return NextResponse.json({ error: '비활성화된 계정입니다.' }, { status: 403 });
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return NextResponse.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }

  const token = await signToken({ sub: user.id, role: user.role, name: user.name });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = req.headers.get('user-agent') ?? null;
  const expiresAt = new Date(Date.now() + COOKIE_MAX_AGE * 1000).toISOString();

  await Promise.all([
    db.from('users').update({ last_active_at: new Date().toISOString() }).eq('id', user.id),
    db.from('user_sessions').insert({
      user_id: user.id,
      ip_address: ip,
      user_agent: userAgent,
      is_active: true,
      expires_at: expiresAt,
    }),
  ]);

  const res = NextResponse.json({
    user: { id: user.id, username: user.username, name: user.name, role: user.role },
  });

  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });

  return res;
}
