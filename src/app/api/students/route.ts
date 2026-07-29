import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { apiOk, apiError } from '@/lib/api/response';
import { NextRequest } from 'next/server';
import { resolveTeacherStudentScope } from '@/lib/monitoring/studentScope';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  if (user.role !== 'teacher') {
    return apiError('권한이 없습니다.', 'FORBIDDEN', 403);
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const view = searchParams.get('view');

  const db = supabaseAdmin();
  const { data: mappings, error: mappingError } = await db
    .from('teacher_student')
    .select('student_id')
    .eq('teacher_id', user.id);
  if (mappingError) {
    return apiError('담당 학생 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
  }
  const scope = resolveTeacherStudentScope(
    (mappings ?? []).map((mapping) => mapping.student_id)
  );

  let query = db
    .from('users')
    .select('id, username, name, is_active, last_active_at')
    .eq('role', 'student')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (q) query = query.or(`name.ilike.%${q}%,username.ilike.%${q}%`);

  if (scope.kind === 'assigned') {
    query = query.in('id', scope.studentIds);
  }

  const { data, error } = await query;
  if (error) return apiError('학생 목록 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);

  if (view === 'monitoring') {
    const studentIds = (data ?? []).map((student) => student.id);
    const { data: sessions, error: sessionError } = studentIds.length > 0
      ? await db
          .from('collaboration_sessions')
          .select(`
            id, student_id, problem_id, status, started_at,
            problems(problem_no, title, difficulty)
          `)
          .eq('status', 'active')
          .in('student_id', studentIds)
          .order('started_at', { ascending: false })
      : { data: [], error: null };
    if (sessionError) {
      return apiError('학생 풀이 현황 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
    }

    const sessionByStudent = new Map<
      string,
      NonNullable<typeof sessions>[number]
    >();
    for (const session of sessions ?? []) {
      if (!sessionByStudent.has(session.student_id)) {
        sessionByStudent.set(session.student_id, session);
      }
    }

    return apiOk({
      users: (data ?? []).map((student) => ({
        ...student,
        activeSession: sessionByStudent.get(student.id) ?? null,
      })),
    });
  }

  return apiOk({ users: data ?? [] });
}
