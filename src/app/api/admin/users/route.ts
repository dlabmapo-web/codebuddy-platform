import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { apiOk, apiError } from '@/lib/api/response';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  if (user.role !== 'admin') return apiError('권한이 없습니다.', 'FORBIDDEN', 403);

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const role = searchParams.get('role') ?? 'all';
  const status = searchParams.get('status') ?? 'all';

  const db = supabaseAdmin();
  let query = db
    .from('users')
    .select('id, username, name, role, is_active, last_active_at, created_at')
    .neq('role', 'admin')
    .order('created_at', { ascending: false });

  if (q) query = query.or(`name.ilike.%${q}%,username.ilike.%${q}%`);
  if (role !== 'all') query = query.eq('role', role);
  if (status === 'active') query = query.eq('is_active', true);
  if (status === 'inactive') query = query.eq('is_active', false);

  const { data: users, error } = await query;
  if (error) return apiError('사용자 목록 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);

  const userIds = (users ?? []).map((u) => u.id);

  const { data: teacherStudents } = await db
    .from('teacher_student')
    .select('teacher_id, student_id, users!teacher_student_student_id_fkey(id, name, username), users!teacher_student_teacher_id_fkey(id, name, username)')
    .or(`teacher_id.in.(${userIds.join(',')}),student_id.in.(${userIds.join(',')})`)
    .limit(userIds.length > 0 ? 1000 : 0);

  const teacherMap: Record<string, string[]> = {};
  const studentMap: Record<string, Array<{ id: string; name: string; username: string }>> = {};

  for (const ts of teacherStudents ?? []) {
    const teacher = (ts as unknown as { users: { id: string; name: string; username: string } })['users'];
    const student = ts.student_id;
    if (!teacherMap[student]) teacherMap[student] = [];
    if (teacher) teacherMap[student].push(teacher.name);

    if (!studentMap[ts.teacher_id]) studentMap[ts.teacher_id] = [];
    const stuRecord = ts as unknown as { 'users!teacher_student_student_id_fkey': { id: string; name: string; username: string } };
    const stuData = stuRecord['users!teacher_student_student_id_fkey'];
    if (stuData) studentMap[ts.teacher_id].push(stuData);
  }

  const result = (users ?? []).map((u) => ({
    ...u,
    teachers: teacherMap[u.id] ?? [],
    student_count: studentMap[u.id]?.length ?? 0,
  }));

  const total = result.length;
  const studentCount = result.filter((u) => u.role === 'student').length;
  const teacherCount = result.filter((u) => u.role === 'teacher').length;
  const activeCount = result.filter((u) => u.is_active).length;

  return apiOk({ users: result, stats: { total, studentCount, teacherCount, activeCount } });
}
