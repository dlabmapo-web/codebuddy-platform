import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { apiOk, apiError } from '@/lib/api/response';
import { NextRequest } from 'next/server';
import { validateTestCases } from '@/lib/judge/testCaseValidation';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  if (user.role !== 'admin') return apiError('권한이 없습니다.', 'FORBIDDEN', 403);

  const db = supabaseAdmin();
  const chapterId = req.nextUrl.searchParams.get('chapter_id')?.trim();
  let query = db
    .from('problems')
    .select('id, problem_no, chapter_id, order_no, title, difficulty, is_published, use_ai_feedback, created_at')
    .order('order_no', { ascending: true });
  if (chapterId) query = query.eq('chapter_id', chapterId);

  const { data, error } = await query;

  if (error) return apiError('문제 목록 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);

  return apiOk({ problems: data });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  if (user.role !== 'admin') return apiError('권한이 없습니다.', 'FORBIDDEN', 403);

  const body = await req.json().catch(() => null);
  if (!body) return apiError('잘못된 요청입니다.', 'BAD_REQUEST', 400);

  const {
    title,
    difficulty,
    description,
    input_format,
    output_format,
    constraint_text,
    starter_code,
    time_limit_ms,
    memory_limit_mb,
    is_published,
    use_ai_feedback,
    chapter_id,
    test_cases,
    hints,
  } = body as {
    title: string;
    difficulty: string;
    description: string;
    input_format?: string;
    output_format?: string;
    constraint_text?: string;
    starter_code?: string;
    time_limit_ms?: number;
    memory_limit_mb?: number;
    is_published?: boolean;
    use_ai_feedback?: boolean;
    chapter_id?: string | null;
    test_cases?: Array<{ input: string; expected_output: string; is_sample: boolean; is_hidden: boolean; order_no: number }>;
    hints?: Array<{ hint_text: string; trigger_pattern?: string; order_no: number }>;
  };

  if (!title?.trim()) return apiError('문제 제목을 입력해주세요.', 'INVALID_TITLE', 400);
  if (!['easy', 'medium', 'hard'].includes(difficulty)) return apiError('올바른 난이도를 선택해주세요.', 'INVALID_DIFFICULTY', 400);
  if (!description?.trim()) return apiError('문제 설명을 입력해주세요.', 'INVALID_DESCRIPTION', 400);
  if (!chapter_id) return apiError('챕터를 선택해주세요.', 'INVALID_CHAPTER', 400);
  const testCaseError = validateTestCases(test_cases ?? [], {
    requiresInput: Boolean(input_format?.trim()),
  });
  if (testCaseError) return apiError(testCaseError, 'INVALID_TEST_CASES', 400);

  const db = supabaseAdmin();

  const { data: maxNo } = await db
    .from('problems')
    .select('problem_no')
    .order('problem_no', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: maxOrder } = await db
    .from('problems')
    .select('order_no')
    .eq('chapter_id', chapter_id)
    .order('order_no', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextNo = (maxNo?.problem_no ?? 0) + 1;

  const { data: problem, error: problemError } = await db
    .from('problems')
    .insert({
      problem_no: nextNo,
      chapter_id,
      order_no: (maxOrder?.order_no ?? 0) + 1,
      title: title.trim(),
      difficulty,
      description: description.trim(),
      input_format: input_format?.trim() ?? null,
      output_format: output_format?.trim() ?? null,
      constraint_text: constraint_text?.trim() ?? null,
      starter_code: starter_code ?? '',
      time_limit_ms: time_limit_ms ?? 3000,
      memory_limit_mb: memory_limit_mb ?? 256,
      is_published: is_published ?? false,
      use_ai_feedback: use_ai_feedback ?? false,
      created_by: user.id,
    })
    .select('*')
    .single();

  if (problemError || !problem) {
    return apiError('문제 등록 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
  }

  if (test_cases?.length) {
    const { error: tcError } = await db.from('test_cases').insert(
      test_cases.map((tc) => ({ ...tc, problem_id: problem.id }))
    );
    if (tcError) {
      await db.from('problems').delete().eq('id', problem.id);
      return apiError('테스트케이스 저장 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
    }
  }

  if (hints?.length) {
    await db.from('problem_hints').insert(
      hints.map((h) => ({ ...h, problem_id: problem.id }))
    );
  }

  return apiOk({ problem }, 201);
}
