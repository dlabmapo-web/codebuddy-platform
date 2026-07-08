import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { apiOk, apiError } from '@/lib/api/response';
import type { AiFeedbackPatternType } from '@/lib/types/db';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  if (user.role !== 'admin') return apiError('권한이 없습니다.', 'FORBIDDEN', 403);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return apiError('잘못된 요청입니다.', 'BAD_REQUEST', 400);

  const { pattern_type, error_category, criteria, example_code, tutor_feedback, order_no, is_active } = body as {
    pattern_type?: AiFeedbackPatternType;
    error_category?: string;
    criteria?: string;
    example_code?: string;
    tutor_feedback?: string;
    order_no?: number;
    is_active?: boolean;
  };

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (pattern_type !== undefined) updates.pattern_type = pattern_type.trim();
  if (error_category !== undefined) updates.error_category = error_category.trim();
  if (criteria !== undefined) updates.criteria = criteria.trim();
  if (example_code !== undefined) updates.example_code = example_code?.trim() ?? null;
  if (tutor_feedback !== undefined) updates.tutor_feedback = tutor_feedback.trim();
  if (order_no !== undefined) updates.order_no = order_no;
  if (is_active !== undefined) updates.is_active = is_active;

  const db = supabaseAdmin();
  const { data, error } = await db.from('ai_feedback_patterns').update(updates).eq('id', id).select('*').single();
  if (error) return apiError('AI 피드백 기준 수정 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
  return apiOk({ pattern: data });
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  if (user.role !== 'admin') return apiError('권한이 없습니다.', 'FORBIDDEN', 403);

  const { id } = await params;
  const db = supabaseAdmin();

  const { error } = await db.from('ai_feedback_patterns').delete().eq('id', id);
  if (error) return apiError('AI 피드백 기준 삭제 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
  return apiOk({ message: 'AI 피드백 기준이 삭제되었습니다.' });
}
