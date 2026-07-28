import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { apiOk, apiError } from '@/lib/api/response';
import { getLearningContext } from '@/lib/curriculum/learningContext.server';
import { canTeacherMonitorStudent } from '@/lib/monitoring/teacherAccess.server';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  if (user.role === 'admin') return apiError('권한이 없습니다.', 'FORBIDDEN', 403);

  const { id } = await params;
  const { data, error } = await supabaseAdmin()
    .from('collaboration_sessions')
    .select('*, problems(problem_no, title, difficulty, description, input_format, output_format, constraint_text, starter_code, time_limit_ms, use_ai_feedback), users!collaboration_sessions_student_id_fkey(id, name, username)')
    .eq('id', id)
    .single();

  if (error || !data) return apiError('세션을 찾을 수 없습니다.', 'NOT_FOUND', 404);

  if (user.role === 'student' && data.student_id !== user.id) {
    return apiError('권한이 없습니다.', 'FORBIDDEN', 403);
  }

  if (user.role === 'teacher') {
    const access = await canTeacherMonitorStudent(user.id, data.student_id);
    if (!access.allowed) {
      return apiError(
        access.reason === 'query_failed'
          ? '담당 학생 확인 중 오류가 발생했습니다.'
          : '권한이 없습니다.',
        access.reason === 'query_failed' ? 'INTERNAL_ERROR' : 'FORBIDDEN',
        access.reason === 'query_failed' ? 500 : 403
      );
    }
  }

  const learning_context = data.problem_id
    ? await getLearningContext({
      problemId: data.problem_id,
      studentId: data.student_id,
    })
    : null;

  return apiOk({ session: { ...data, learning_context } });
}

export async function PATCH(req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  if (user.role === 'admin') return apiError('권한이 없습니다.', 'FORBIDDEN', 403);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return apiError('잘못된 요청입니다.', 'BAD_REQUEST', 400);

  const db = supabaseAdmin();
  const { data: session } = await db.from('collaboration_sessions').select('student_id, teacher_id').eq('id', id).single();
  if (!session) return apiError('세션을 찾을 수 없습니다.', 'NOT_FOUND', 404);

  if (user.role === 'student' && session.student_id !== user.id) return apiError('권한이 없습니다.', 'FORBIDDEN', 403);
  if (user.role === 'teacher' && session.teacher_id !== user.id && session.teacher_id !== null) {
    return apiError('권한이 없습니다.', 'FORBIDDEN', 403);
  }

  const { status, final_code, teacher_id } = body as { status?: string; final_code?: string | null; teacher_id?: string };
  const updates: Record<string, unknown> = {};

  if (status) updates.status = status;
  if (final_code !== undefined) updates.final_code = final_code;
  if (teacher_id !== undefined) updates.teacher_id = teacher_id;
  if (status === 'ended') updates.ended_at = new Date().toISOString();

  const { data, error } = await db.from('collaboration_sessions').update(updates).eq('id', id).select().single();
  if (error) return apiError('세션 업데이트 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
  return apiOk({ session: data });
}
