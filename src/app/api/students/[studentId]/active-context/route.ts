import { getCurrentUser } from '@/lib/auth/session';
import { apiError, apiOk } from '@/lib/api/response';
import { getLearningPath } from '@/lib/curriculum/learningContext.server';
import { canTeacherMonitorStudent } from '@/lib/monitoring/teacherAccess.server';
import { supabaseAdmin } from '@/lib/supabase/admin';

type Params = { params: Promise<{ studentId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  if (user.role !== 'teacher') {
    return apiError('권한이 없습니다.', 'FORBIDDEN', 403);
  }

  const { studentId } = await params;
  const access = await canTeacherMonitorStudent(user.id, studentId);
  if (!access.allowed) {
    return apiError(
      access.reason === 'query_failed'
        ? '담당 학생 확인 중 오류가 발생했습니다.'
        : '권한이 없습니다.',
      access.reason === 'query_failed' ? 'INTERNAL_ERROR' : 'FORBIDDEN',
      access.reason === 'query_failed' ? 500 : 403
    );
  }

  const { data: student, error: studentError } = await supabaseAdmin()
    .from('users')
    .select('id')
    .eq('id', studentId)
    .eq('role', 'student')
    .eq('is_active', true)
    .maybeSingle();
  if (studentError) {
    return apiError(
      '학생 조회 중 오류가 발생했습니다.',
      'INTERNAL_ERROR',
      500
    );
  }
  if (!student) {
    return apiError('학생을 찾을 수 없습니다.', 'NOT_FOUND', 404);
  }

  const { data: session, error: sessionError } = await supabaseAdmin()
    .from('collaboration_sessions')
    .select('id, problem_id')
    .eq('student_id', studentId)
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (sessionError) {
    return apiError(
      '활성 세션 조회 중 오류가 발생했습니다.',
      'INTERNAL_ERROR',
      500
    );
  }

  if (!session?.problem_id) {
    return apiOk({ active_context: { active: false } });
  }

  const path = await getLearningPath(session.problem_id);
  return apiOk({
    active_context: {
      active: true,
      session_id: session.id,
      problem_id: session.problem_id,
      path,
    },
  });
}
