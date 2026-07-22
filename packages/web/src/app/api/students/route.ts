import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { apiOk, apiError } from '@/lib/api/response';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  if (user.role !== 'teacher' && user.role !== 'admin') {
    return apiError('권한이 없습니다.', 'FORBIDDEN', 403);
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';

  const db = supabaseAdmin();
  let query = db
    .from('users')
    .select('id, username, name, is_active, last_active_at')
    .eq('role', 'student')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (q) query = query.or(`name.ilike.%${q}%,username.ilike.%${q}%`);

  if (user.role === 'teacher') {
    const { data: mappings } = await db
      .from('teacher_student')
      .select('student_id')
      .eq('teacher_id', user.id);
    const studentIds = (mappings ?? []).map((m) => m.student_id);
    if (studentIds.length > 0) {
      query = query.in('id', studentIds);
    }
  }

  const { data, error } = await query;
  if (error) return apiError('학생 목록 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
  return apiOk({ users: data ?? [] });
}
