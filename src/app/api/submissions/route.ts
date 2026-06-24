import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { apiOk, apiError } from '@/lib/api/response';
import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);

  const { searchParams } = new URL(req.url);
  const problemId = searchParams.get('problem_id');
  const studentId = searchParams.get('student_id');

  const db = supabaseAdmin();

  if ((user.role === 'teacher' || user.role === 'admin') && studentId) {
    let query = db
      .from('submissions')
      .select('id, problem_id, code, status, score, passed_count, total_count, runtime_ms, elapsed_sec, submitted_at, problems(problem_no, title, difficulty), users(id, name, username)')
      .eq('user_id', studentId)
      .order('submitted_at', { ascending: false });

    if (problemId) query = query.eq('problem_id', problemId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return apiOk({ submissions: data });
  }

  let query = db
    .from('submissions')
    .select('id, problem_id, code, status, score, passed_count, total_count, runtime_ms, elapsed_sec, submitted_at, problems(problem_no, title, difficulty)')
    .eq('user_id', user.id)
    .order('submitted_at', { ascending: false });

  if (problemId) query = query.eq('problem_id', problemId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return apiOk({ submissions: data });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);

  const body = await req.json().catch(() => null);
  if (!body) return apiError('잘못된 요청입니다.', 'BAD_REQUEST', 400);

  const { problem_id, language, code, status, score, passed_count, total_count, runtime_ms, elapsed_sec } = body;

  if (!problem_id) return apiError('문제 ID가 필요합니다.', 'MISSING_PROBLEM_ID', 400);
  if (!['pass', 'fail', 'partial'].includes(status)) return apiError('올바르지 않은 채점 결과입니다.', 'INVALID_STATUS', 400);

  const { data, error } = await supabaseAdmin()
    .from('submissions')
    .insert({
      problem_id,
      user_id: user.id,
      language: language ?? 'python',
      code,
      status,
      score: Math.max(0, Math.min(100, score ?? 0)),
      passed_count: passed_count ?? 0,
      total_count: total_count ?? 0,
      runtime_ms: runtime_ms ?? null,
      elapsed_sec: elapsed_sec ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return apiOk({ submission: data }, 201);
}
