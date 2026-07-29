import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { apiOk, apiError } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/requireAdmin';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const subjectId = req.nextUrl.searchParams.get('subject_id')?.trim() ?? '';
  const db = supabaseAdmin();

  let query = db
    .from('stages')
    .select('*, chapters(count)')
    .order('order_no', { ascending: true });
  if (subjectId) query = query.eq('subject_id', subjectId);

  const { data: stages, error } = await query;
  if (error) return apiError('단계 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);

  return apiOk({
    stages: (stages ?? []).map(({ chapters, ...stage }) => ({
      ...stage,
      chapter_count: chapters?.[0]?.count ?? 0,
    })),
  });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  if (!body) return apiError('잘못된 요청입니다.', 'BAD_REQUEST', 400);

  const { subject_id, title, description, is_published, order_no } = body as {
    subject_id?: string;
    title?: string;
    description?: string;
    is_published?: boolean;
    order_no?: number;
  };
  if (!subject_id) return apiError('과목을 선택해주세요.', 'INVALID_SUBJECT', 400);
  if (!title?.trim()) return apiError('단계 이름을 입력해주세요.', 'INVALID_TITLE', 400);

  const db = supabaseAdmin();
  let nextOrder = order_no;
  if (nextOrder === undefined || nextOrder === null || Number.isNaN(Number(nextOrder))) {
    const { data: maxNo } = await db
      .from('stages')
      .select('order_no')
      .eq('subject_id', subject_id)
      .order('order_no', { ascending: false })
      .limit(1)
      .maybeSingle();
    nextOrder = (maxNo?.order_no ?? 0) + 1;
  }

  const { data, error } = await db
    .from('stages')
    .insert({
      subject_id,
      title: title.trim(),
      description: description?.trim() ?? null,
      order_no: Number(nextOrder),
      is_published: is_published ?? true,
    })
    .select('*')
    .single();

  if (error) return apiError('단계 등록 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
  return apiOk({ stage: data }, 201);
}
