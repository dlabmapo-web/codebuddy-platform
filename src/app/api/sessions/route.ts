import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { apiOk, apiError } from '@/lib/api/response';
import { resolveTeacherStudentScope } from '@/lib/monitoring/studentScope';

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  if (user.role === 'admin') return apiError('권한이 없습니다.', 'FORBIDDEN', 403);

  const db = supabaseAdmin();
  const view = new URL(req.url).searchParams.get('view');
  if (user.role === 'student' && view === 'drafts') {
    const { data, error } = await db
      .from('collaboration_sessions')
      .select('id, problem_id, final_code, started_at, problems(problem_no, title, difficulty)')
      .eq('student_id', user.id)
      .not('final_code', 'is', null)
      .order('started_at', { ascending: false });
    if (error) {
      return apiError('임시 저장 목록 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
    }
    return apiOk({ sessions: data ?? [] });
  }

  let query = db
    .from('collaboration_sessions')
    .select('*, problems(problem_no, title, difficulty), users!collaboration_sessions_student_id_fkey(id, name, username)')
    .order('started_at', { ascending: false });

  if (user.role === 'student') {
    query = query.eq('student_id', user.id);
  } else if (user.role === 'teacher') {
    query = query.eq('status', 'active');
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
    if (scope.kind === 'assigned') {
      query = query.in('student_id', scope.studentIds);
    }
  }

  const { data, error } = await query;
  if (error) return apiError('세션 목록 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
  return apiOk({ sessions: data });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  if (user.role !== 'student') return apiError('학생만 세션을 생성할 수 있습니다.', 'FORBIDDEN', 403);

  const body = await req.json().catch(() => null);
  if (!body) return apiError('잘못된 요청입니다.', 'BAD_REQUEST', 400);

  const {
    problem_id,
    previous_session_id,
    previous_final_code,
  } = body as {
    problem_id?: string;
    previous_session_id?: string;
    previous_final_code?: string;
  };
  const db = supabaseAdmin();

  if (previous_session_id && typeof previous_final_code === 'string') {
    await db
      .from('collaboration_sessions')
      .update({
        final_code: previous_final_code,
        status: 'ended',
        ended_at: new Date().toISOString(),
      })
      .eq('id', previous_session_id)
      .eq('student_id', user.id);
  }

  // 새로고침이나 중복 요청에는 현재 활성 세션을 재사용한다.
  // 종료된 세션은 다시 활성화하지 않아 이전 피드백이 새 풀이에 섞이지 않게 한다.
  const { data: existing } = await db
    .from('collaboration_sessions')
    .select('*')
    .eq('student_id', user.id)
    .eq('problem_id', problem_id ?? null)
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return apiOk({ session: existing });
  }

  // A new collaboration session keeps feedback isolated, but the student's
  // latest saved code for this problem should survive moving away and back.
  const { data: previousSession } = await db
    .from('collaboration_sessions')
    .select('final_code')
    .eq('student_id', user.id)
    .eq('problem_id', problem_id ?? null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  await db
    .from('collaboration_sessions')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('student_id', user.id)
    .eq('status', 'active');

  const { data, error } = await db
    .from('collaboration_sessions')
    .insert({
      problem_id: problem_id ?? null,
      student_id: user.id,
      status: 'active',
      final_code: previousSession?.final_code ?? null,
    })
    .select()
    .single();

  if (error) return apiError('세션 생성 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
  return apiOk({ session: data }, 201);
}
