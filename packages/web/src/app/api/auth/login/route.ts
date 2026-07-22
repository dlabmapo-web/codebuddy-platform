import { supabaseAdmin } from '@/lib/supabase/admin';
import { verifyPassword } from '@/lib/auth/password';
import { signToken } from '@/lib/auth/jwt';
import { COOKIE_NAME } from '@/lib/auth/session';
import { apiError, apiOk } from '@/lib/api/response';

const COOKIE_MAX_AGE = 7 * 24 * 60 * 60;
const GENERIC_AUTH_ERROR = '아이디 또는 비밀번호가 올바르지 않습니다.';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return apiError('잘못된 요청입니다.', 'BAD_REQUEST', 400);

  const { username, password } = body as { username?: string; password?: string };

  if (!username?.trim() || !password) {
    return apiError('아이디와 비밀번호를 입력해주세요.', 'MISSING_FIELDS', 400);
  }

  const db = supabaseAdmin();
  const { data: user } = await db
    .from('users')
    .select('id, username, password_hash, name, role, is_active')
    .eq('username', username.trim())
    .maybeSingle();

  if (!user) {
    return apiError(GENERIC_AUTH_ERROR, 'INVALID_CREDENTIALS', 401);
  }
  if (!user.is_active) {
    return apiError('비활성화된 계정입니다. 관리자에게 문의하세요.', 'ACCOUNT_DISABLED', 403);
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return apiError(GENERIC_AUTH_ERROR, 'INVALID_CREDENTIALS', 401);
  }

  const token = await signToken({ sub: user.id, role: user.role, name: user.name });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = req.headers.get('user-agent') ?? null;
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + COOKIE_MAX_AGE * 1000).toISOString();

  await Promise.all([
    db.from('users').update({ last_active_at: now }).eq('id', user.id),
    db.from('user_sessions').insert({
      user_id: user.id,
      ip_address: ip,
      user_agent: userAgent,
      is_active: true,
      last_seen_at: now,
      expires_at: expiresAt,
    }),
  ]);

  const res = apiOk({
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
