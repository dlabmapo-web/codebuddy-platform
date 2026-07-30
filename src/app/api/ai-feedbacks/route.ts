import { createHash } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { apiOk, apiError } from '@/lib/api/response';
import OpenAI from 'openai';
import {
  buildKoreanSyntaxExplanationPrompt,
  DEFAULT_DAILY_SYNTAX_AI_LIMIT,
  isKoreanExplanation,
  parseSyntaxExplanationRequest,
  startOfCurrentKoreanDay,
} from '@/lib/ai/syntaxExplanation';
import {
  createSyntaxLesson,
  isSyntaxExecutionError,
} from '@/lib/pyodide/pythonError';

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  if (user.role !== 'student') {
    return apiError('학생 계정에서만 AI 오류 설명을 요청할 수 있습니다.', 'FORBIDDEN', 403);
  }

  const body = await req.json().catch(() => null);
  if (!body) return apiError('잘못된 요청입니다.', 'BAD_REQUEST', 400);

  const parsedRequest = parseSyntaxExplanationRequest(body);
  if (!parsedRequest) {
    return apiError('문법 오류 정보가 올바르지 않습니다.', 'INVALID_SYNTAX_ERROR', 400);
  }
  if (!isSyntaxExecutionError(parsedRequest.error)) {
    return apiError('문법 오류에만 AI 설명을 제공합니다.', 'SYNTAX_ONLY', 400);
  }

  const lesson = createSyntaxLesson(parsedRequest.error);
  if (!lesson || lesson.category !== parsedRequest.category) {
    return apiError('오류 분류가 실행 결과와 일치하지 않습니다.', 'CATEGORY_MISMATCH', 400);
  }

  const db = supabaseAdmin();

  const { data: problem } = await db
    .from('problems')
    .select('id, title, use_ai_feedback')
    .eq('id', parsedRequest.problemId)
    .maybeSingle();

  if (!problem || !problem.use_ai_feedback) {
    return apiError('이 문제는 AI 피드백을 사용하지 않습니다.', 'AI_FEEDBACK_DISABLED', 400);
  }

  const codeHash = createHash('sha256')
    .update(parsedRequest.code)
    .digest('hex');

  const { data: cached, error: cacheError } = await db
    .from('ai_feedbacks')
    .select('*')
    .eq('student_id', user.id)
    .eq('problem_id', parsedRequest.problemId)
    .eq('error_category', lesson.category)
    .eq('code_hash', codeHash)
    .maybeSingle();
  if (cacheError) {
    return apiError('AI 설명 기록을 확인하지 못했습니다.', 'INTERNAL_ERROR', 500);
  }
  if (cached) return apiOk({ feedback: cached, cached: true });

  const { count, error: quotaError } = await db
    .from('ai_feedbacks')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', user.id)
    .not('error_category', 'is', null)
    .gte('created_at', startOfCurrentKoreanDay());
  if (quotaError) {
    return apiError('AI 사용량을 확인하지 못했습니다.', 'INTERNAL_ERROR', 500);
  }
  const configuredLimit = Number.parseInt(process.env.AI_SYNTAX_DAILY_LIMIT ?? '', 10);
  const dailyLimit = Number.isFinite(configuredLimit) && configuredLimit > 0
    ? configuredLimit
    : DEFAULT_DAILY_SYNTAX_AI_LIMIT;
  if ((count ?? 0) >= dailyLimit) {
    return apiError(
      `오늘 사용할 수 있는 AI 추가 설명 ${dailyLimit}회를 모두 사용했어요. 기본 오류 코치는 계속 사용할 수 있어요.`,
      'DAILY_LIMIT_REACHED',
      429,
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    return apiError(
      'AI 설명 기능이 아직 설정되지 않았어요. 기본 오류 코치를 참고해 주세요.',
      'AI_NOT_CONFIGURED',
      503,
    );
  }

  const prompt = buildKoreanSyntaxExplanationPrompt({
    problemTitle: problem.title,
    request: parsedRequest,
    lesson,
  });
  const model = process.env.OPENAI_AI_FEEDBACK_MODEL ?? 'gpt-4o-mini';

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      max_tokens: 180,
      temperature: 0.3,
    });
    const feedbackText = completion.choices[0]?.message?.content?.trim();
    if (!feedbackText || !isKoreanExplanation(feedbackText)) {
      return apiError('AI가 설명을 만들지 못했어요. 잠시 후 다시 시도해 주세요.', 'EMPTY_AI_RESPONSE', 502);
    }

    const { data: saved, error: saveError } = await db
      .from('ai_feedbacks')
      .insert({
        submission_id: null,
        problem_id: parsedRequest.problemId,
        student_id: user.id,
        matched_pattern_id: null,
        error_category: lesson.category,
        code_hash: codeHash,
        content: feedbackText,
        model,
      })
      .select('*')
      .single();

    if (!saveError) return apiOk({ feedback: saved, cached: false }, 201);
    if (saveError.code === '23505') {
      const { data: racedCache } = await db
        .from('ai_feedbacks')
        .select('*')
        .eq('student_id', user.id)
        .eq('problem_id', parsedRequest.problemId)
        .eq('error_category', lesson.category)
        .eq('code_hash', codeHash)
        .maybeSingle();
      if (racedCache) return apiOk({ feedback: racedCache, cached: true });
    }
    return apiError('AI 설명을 저장하지 못했습니다.', 'INTERNAL_ERROR', 500);
  } catch {
    return apiError(
      'AI 설명을 불러오지 못했어요. 기본 오류 코치를 참고해 다시 시도해 보세요.',
      'AI_PROVIDER_ERROR',
      502,
    );
  }
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  if (user.role === 'admin') return apiError('권한이 없습니다.', 'FORBIDDEN', 403);

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
  } else if (sessionScope && user.role === 'teacher') {
    query = query.eq('student_id', sessionScope.student_id);
  } else if (user.role === 'teacher' && studentId) {
    query = query.eq('student_id', studentId);
  } else {
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
