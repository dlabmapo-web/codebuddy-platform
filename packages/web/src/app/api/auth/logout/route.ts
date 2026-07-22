import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser, COOKIE_NAME } from '@/lib/auth/session';
import { apiOk } from '@/lib/api/response';

export async function POST() {
  const user = await getCurrentUser();

  if (user) {
    await supabaseAdmin()
      .from('user_sessions')
      .update({ is_active: false })
      .eq('user_id', user.id)
      .eq('is_active', true);
  }

  const res = apiOk({ ok: true });
  res.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });

  return res;
}
