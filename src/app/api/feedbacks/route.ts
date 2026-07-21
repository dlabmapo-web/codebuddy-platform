import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { apiOk, apiError } from '@/lib/api/response';

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  if (user.role !== 'teacher' && user.role !== 'admin') return apiError('권한이 없습니다.', 'FORBIDDEN', 403);

  const body = await req.json().catch(() => null);
  if (!body) return apiError('잘못된 요청입니다.', 'BAD_REQUEST', 400);

  const { session_id, student_id, problem_id, content } = body as {
    session_id?: string;
    student_id: string;
    problem_id?: string;
    content: string;
  };

  if (!student_id) return apiError('학생 ID가 필요합니다.', 'MISSING_STUDENT', 400);
  if (!content?.trim()) return apiError('피드백 내용을 입력해주세요.', 'MISSING_CONTENT', 400);

  const { data, error } = await supabaseAdmin()
    .from('feedbacks')
    .insert({
      session_id: session_id ?? null,
      teacher_id: user.id,
      student_id,
      problem_id: problem_id ?? null,
      content: content.trim(),
    })
    .select()
    .single();

  if (error) return apiError('피드백 저장 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
  return apiOk({ feedback: data }, 201);
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);

  const { searchParams } = new URL(req.url);
  const problemId = searchParams.get('problem_id');
  const sessionId = searchParams.get('session_id');

  const db = supabaseAdmin();
  let query = db
    .from('feedbacks')
    .select('*, users!feedbacks_teacher_id_fkey(name)')
    .order('created_at', { ascending: false });

  if (user.role === 'student') {
    query = query.eq('student_id', user.id);
  } else if (user.role === 'teacher') {
    query = query.eq('teacher_id', user.id);
  }

  if (sessionId) query = query.eq('session_id', sessionId);
  else if (problemId) query = query.eq('problem_id', problemId);

  const { data, error } = await query;
  if (error) return apiError('피드백 목록 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
  return apiOk({ feedbacks: data });
}
