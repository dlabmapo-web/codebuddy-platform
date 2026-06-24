import { getCurrentUser } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { apiOk, apiError } from '@/lib/api/response';

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);

  const { error } = await supabaseAdmin()
    .from('users')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', user.id);

  if (error) return apiError('갱신 실패', 'INTERNAL_ERROR', 500);
  return apiOk({ ok: true });
}
