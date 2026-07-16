import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { apiOk, apiError } from '@/lib/api/response';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);

  const subjectId = req.nextUrl.searchParams.get('subject_id')?.trim() ?? '';
  if (!subjectId) return apiError('과목을 선택해주세요.', 'INVALID_SUBJECT', 400);

  const db = supabaseAdmin();

  const { data: subject } = await db
    .from('subjects')
    .select('id, title, order_no, is_published')
    .eq('id', subjectId)
    .eq('is_published', true)
    .maybeSingle();

  if (!subject) return apiError('과목을 찾을 수 없습니다.', 'NOT_FOUND', 404);

  const { data, error } = await db
    .from('stages')
    .select('id, title, description, order_no, subject_id')
    .eq('subject_id', subjectId)
    .eq('is_published', true)
    .order('order_no', { ascending: true });

  if (error) return apiError('단계 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
  return apiOk({ subject, stages: data ?? [] });
}
