import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { apiOk, apiError } from '@/lib/api/response';
import OpenAI from 'openai';
import type { DbAiFeedbackPattern } from '@/lib/types/db';

function buildSystemPrompt(patterns: DbAiFeedbackPattern[]): string {
  const list = patterns
    .map((p, i) => {
      const example = p.example_code ? `\n예시 코드:\n${p.example_code}` : '';
      return `${i + 1}. [${p.pattern_type}] ${p.error_category}\n판단 기준: ${p.criteria}${example}\n튜터 피드백 원문: ${p.tutor_feedback}`;
    })
    .join('\n\n');

  return `너는 코딩 교육 플랫폼의 AI 코드 검사관이다. 학생이 제출한 코드가 채점에 실패했을 때, 아래 "판단 기준 목록"에 있는 오류 패턴에만 근거하여 학생 코드가 어떤 오류에 해당하는지 판정하고 대응되는 피드백을 반환한다.

규칙:
1. 반드시 아래 목록 중 학생 코드와 가장 명확히 일치하는 항목 하나만 선택한다. 목록에 없는 새로운 오류 유형을 만들어내지 않는다.
2. 목록의 어떤 항목도 코드의 실제 문제와 뚜렷하게 일치하지 않으면 matched_index를 null로 하고, 코드에서 실제로 관찰되는 사실만으로 짧고 구체적인 피드백을 작성한다.
3. 항목을 선택했다면 그 항목의 "튜터 피드백 원문"을 근거로, 학생 코드에 실제로 등장하는 변수명과 구조에 맞게 자연스러운 한국어 문장으로 다듬어 반환한다. 항목이 말하는 오류의 본질을 바꾸지 않는다.
4. 정답 코드 자체를 알려주지 않는다. 오류의 원인과 고쳐야 할 방향만 안내한다.
5. 피드백은 한국어 2~4문장으로 작성한다.
6. 반드시 JSON 객체 형식으로만 응답한다: {"matched_index": number | null, "feedback": string}

판단 기준 목록:
${list}`;
}

function buildUserPrompt(title: string, description: string, code: string, errorMessage: string | null): string {
  return `문제 제목: ${title}
문제 설명: ${description}
학생 코드:
\`\`\`python
${code}
\`\`\`
${errorMessage ? `실행 결과 오류: ${errorMessage}` : '실행 결과: 오답 (기대한 출력과 다름)'}`;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);

  const body = await req.json().catch(() => null);
  if (!body) return apiError('잘못된 요청입니다.', 'BAD_REQUEST', 400);

  const { submission_id, problem_id, code, error_message } = body as {
    submission_id?: string;
    problem_id?: string;
    code?: string;
    error_message?: string;
  };

  if (!submission_id || !problem_id || !code) {
    return apiError('필수 필드가 누락되었습니다.', 'MISSING_FIELDS', 400);
  }

  const db = supabaseAdmin();

  const { data: submission } = await db
    .from('submissions')
    .select('id, user_id, problem_id, status')
    .eq('id', submission_id)
    .single();

  if (!submission || submission.user_id !== user.id || submission.problem_id !== problem_id) {
    return apiError('제출 내역을 찾을 수 없습니다.', 'NOT_FOUND', 404);
  }
  if (submission.status === 'pass') {
    return apiError('정답인 제출에는 AI 피드백을 제공하지 않습니다.', 'ALREADY_PASSED', 400);
  }

  const { data: problem } = await db
    .from('problems')
    .select('title, description, use_ai_feedback')
    .eq('id', problem_id)
    .single();

  if (!problem || !problem.use_ai_feedback) {
    return apiError('이 문제는 AI 피드백을 사용하지 않습니다.', 'AI_FEEDBACK_DISABLED', 400);
  }

  const { data: patterns } = await db
    .from('ai_feedback_patterns')
    .select('*')
    .eq('is_active', true)
    .order('order_no', { ascending: true });

  const patternList = (patterns ?? []) as DbAiFeedbackPattern[];

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: buildSystemPrompt(patternList) },
      { role: 'user', content: buildUserPrompt(problem.title, problem.description, code, error_message ?? null) },
    ],
    max_tokens: 500,
  });

  const raw = completion.choices[0]?.message?.content ?? '{}';

  let matchedIndex: number | null = null;
  let feedbackText = '';

  try {
    const parsed = JSON.parse(raw) as { matched_index?: number | null; feedback?: string };
    matchedIndex = typeof parsed.matched_index === 'number' ? parsed.matched_index : null;
    feedbackText = parsed.feedback?.trim() ?? '';
  } catch {
    feedbackText = raw.trim();
  }

  if (!feedbackText) {
    feedbackText = '코드를 다시 살펴보고 문제에서 요구하는 조건과 출력 형식을 다시 확인해보세요.';
  }

  const matchedPattern =
    matchedIndex !== null && matchedIndex >= 1 && matchedIndex <= patternList.length
      ? patternList[matchedIndex - 1]
      : null;

  const { data: saved, error } = await db
    .from('ai_feedbacks')
    .insert({
      submission_id,
      problem_id,
      student_id: user.id,
      matched_pattern_id: matchedPattern?.id ?? null,
      content: feedbackText,
      model: 'gpt-4o-mini',
    })
    .select('*')
    .single();

  if (error) return apiError('AI 피드백 저장 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
  return apiOk({ feedback: saved }, 201);
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);

  const { searchParams } = new URL(req.url);
  const problemId = searchParams.get('problem_id');
  const studentId = searchParams.get('student_id');
  const sessionId = searchParams.get('session_id');

  const db = supabaseAdmin();
  let sessionScope: {
    student_id: string;
    problem_id: string | null;
    started_at: string;
    ended_at: string | null;
  } | null = null;

  if (sessionId) {
    const { data: session } = await db
      .from('collaboration_sessions')
      .select('student_id, problem_id, started_at, ended_at')
      .eq('id', sessionId)
      .maybeSingle();

    if (!session) return apiError('풀이 세션을 찾을 수 없습니다.', 'SESSION_NOT_FOUND', 404);
    if (user.role === 'student' && session.student_id !== user.id) {
      return apiError('권한이 없습니다.', 'FORBIDDEN', 403);
    }
    sessionScope = session;
  }

  let query = db
    .from('ai_feedbacks')
    .select('*, ai_feedback_patterns(error_category, pattern_type)')
    .order('created_at', { ascending: false });

  if (user.role === 'student') {
    query = query.eq('student_id', user.id);
  } else if (sessionScope && (user.role === 'teacher' || user.role === 'admin')) {
    query = query.eq('student_id', sessionScope.student_id);
  } else if ((user.role === 'teacher' || user.role === 'admin') && studentId) {
    query = query.eq('student_id', studentId);
  } else if (user.role !== 'admin') {
    return apiError('권한이 없습니다.', 'FORBIDDEN', 403);
  }

  if (sessionScope) {
    if (sessionScope.problem_id) query = query.eq('problem_id', sessionScope.problem_id);
    query = query.gte('created_at', sessionScope.started_at);
    if (sessionScope.ended_at) query = query.lte('created_at', sessionScope.ended_at);
  } else if (problemId) {
    query = query.eq('problem_id', problemId);
  }

  const { data, error } = await query;
  if (error) return apiError('AI 피드백 목록 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
  return apiOk({ feedbacks: data });
}
