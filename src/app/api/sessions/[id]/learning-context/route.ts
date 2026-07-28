import { getCurrentUser } from '@/lib/auth/session';
import { apiError, apiOk } from '@/lib/api/response';
import { getLearningContext } from '@/lib/curriculum/learningContext.server';
import { canTeacherMonitorStudent } from '@/lib/monitoring/teacherAccess.server';
import { supabaseAdmin } from '@/lib/supabase/admin';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  if (user.role !== 'teacher') {
    return apiError('권한이 없습니다.', 'FORBIDDEN', 403);
  }

  const { id } = await params;
  const { data: session, error } = await supabaseAdmin()
    .from('collaboration_sessions')
    .select('id, student_id, problem_id')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    return apiError('세션 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
  }
  if (!session?.problem_id) {
    return apiError('세션을 찾을 수 없습니다.', 'NOT_FOUND', 404);
  }

  const access = await canTeacherMonitorStudent(user.id, session.student_id);
  if (!access.allowed) {
    return apiError(
      access.reason === 'query_failed'
        ? '담당 학생 확인 중 오류가 발생했습니다.'
        : '권한이 없습니다.',
      access.reason === 'query_failed' ? 'INTERNAL_ERROR' : 'FORBIDDEN',
      access.reason === 'query_failed' ? 500 : 403
    );
  }

  const learningContext = await getLearningContext({
    problemId: session.problem_id,
    studentId: session.student_id,
  });
  if (!learningContext) {
    return apiError(
      '학습 위치를 불러올 수 없습니다.',
      'CONTEXT_NOT_FOUND',
      404
    );
  }

  return apiOk({ learning_context: learningContext });
}
