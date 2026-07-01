import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { apiOk, apiError } from '@/lib/api/response';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);

  const db = supabaseAdmin();
  let query = db
    .from('collaboration_sessions')
    .select('*, problems(problem_no, title, difficulty), users!collaboration_sessions_student_id_fkey(id, name, username)')
    .order('started_at', { ascending: false });

  if (user.role === 'student') {
    query = query.eq('student_id', user.id);
  } else if (user.role === 'teacher') {
    query = query.eq('status', 'active');
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

  const { problem_id } = body as { problem_id?: string };
  const db = supabaseAdmin();

  // 같은 (학생 + 문제) 세션이 이미 있으면 새로 만들지 않고 재사용한다.
  // 이렇게 하면 작성하던 코드(final_code)가 방문할 때마다 유지되고,
  // 빈 세션이 무한히 쌓이는 문제도 방지된다.
  const { data: existing } = await db
    .from('collaboration_sessions')
    .select('*')
    .eq('student_id', user.id)
    .eq('problem_id', problem_id ?? null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    // 다른 문제의 active 세션은 정리 (학생은 한 번에 한 문제만 풀이중)
    await db
      .from('collaboration_sessions')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('student_id', user.id)
      .eq('status', 'active')
      .neq('id', existing.id);

    // 이미 정답(pass)을 맞춘 문제라면 draft 코드를 클리어해서 새 코드로 시작
    const { count: passCount } = await db
      .from('submissions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('problem_id', problem_id ?? '')
      .eq('status', 'pass');

    const clearDraft = (passCount ?? 0) > 0;

    const { data: reactivated, error: reErr } = await db
      .from('collaboration_sessions')
      .update({
        status: 'active',
        ended_at: null,
        ...(clearDraft ? { final_code: null } : {}),
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (reErr) return apiError('세션 재개 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
    return apiOk({ session: reactivated });
  }

  // 기존 세션이 없을 때만 새로 생성
  await db
    .from('collaboration_sessions')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('student_id', user.id)
    .eq('status', 'active');

  const { data, error } = await db
    .from('collaboration_sessions')
    .insert({ problem_id: problem_id ?? null, student_id: user.id, status: 'active' })
    .select()
    .single();

  if (error) return apiError('세션 생성 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
  return apiOk({ session: data }, 201);
}
