import { getCurrentUser } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { apiError, apiOk } from '@/lib/api/response';

export async function GET() {
  const session = await getCurrentUser();
  if (!session) {
    return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  }

  const { data: user, error } = await supabaseAdmin()
    .from('users')
    .select('id, username, name, role, last_active_at, created_at')
    .eq('id', session.id)
    .single();

  if (error || !user) {
    return apiError('사용자를 찾을 수 없습니다.', 'USER_NOT_FOUND', 404);
  }

  return apiOk({ user });
}
