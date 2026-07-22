import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { apiOk, apiError } from '@/lib/api/response';
import type { AiFeedbackPatternType } from '@/lib/types/db';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  if (user.role !== 'admin') return apiError('권한이 없습니다.', 'FORBIDDEN', 403);

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('ai_feedback_patterns')
    .select('*')
    .order('order_no', { ascending: true });

  if (error) return apiError('AI 피드백 기준 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
  return apiOk({ patterns: data });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  if (user.role !== 'admin') return apiError('권한이 없습니다.', 'FORBIDDEN', 403);

  const body = await req.json().catch(() => null);
  if (!body) return apiError('잘못된 요청입니다.', 'BAD_REQUEST', 400);

  const { pattern_type, error_category, criteria, example_code, tutor_feedback, is_active } = body as {
    pattern_type?: AiFeedbackPatternType;
    error_category?: string;
    criteria?: string;
    example_code?: string;
    tutor_feedback?: string;
    is_active?: boolean;
  };

  if (!pattern_type?.trim()) return apiError('유형을 입력해주세요.', 'INVALID_PATTERN_TYPE', 400);
  if (!error_category?.trim()) return apiError('오류 분류를 입력해주세요.', 'INVALID_ERROR_CATEGORY', 400);
  if (!criteria?.trim()) return apiError('판단 기준을 입력해주세요.', 'INVALID_CRITERIA', 400);
  if (!tutor_feedback?.trim()) return apiError('튜터 피드백을 입력해주세요.', 'INVALID_TUTOR_FEEDBACK', 400);

  const db = supabaseAdmin();

  const { data: maxNo } = await db
    .from('ai_feedback_patterns')
    .select('order_no')
    .order('order_no', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await db
    .from('ai_feedback_patterns')
    .insert({
      pattern_type: pattern_type.trim(),
      error_category: error_category.trim(),
      criteria: criteria.trim(),
      example_code: example_code?.trim() ?? null,
      tutor_feedback: tutor_feedback.trim(),
      order_no: (maxNo?.order_no ?? 0) + 1,
      is_active: is_active ?? true,
    })
    .select('*')
    .single();

  if (error) return apiError('AI 피드백 기준 등록 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
  return apiOk({ pattern: data }, 201);
}
