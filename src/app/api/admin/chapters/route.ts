import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { apiOk, apiError } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/requireAdmin';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const stageId = req.nextUrl.searchParams.get('stage_id')?.trim() ?? '';
  const db = supabaseAdmin();

  let query = db.from('chapters').select('*').order('order_no', { ascending: true });
  if (stageId) query = query.eq('stage_id', stageId);

  const { data: chapters, error } = await query;
  if (error) return apiError('챕터 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);

  const { data: problems } = await db.from('problems').select('id, chapter_id');
  const countMap: Record<string, number> = {};
  for (const p of problems ?? []) {
    if (p.chapter_id) countMap[p.chapter_id] = (countMap[p.chapter_id] ?? 0) + 1;
  }

  return apiOk({
    chapters: (chapters ?? []).map((c) => ({ ...c, problem_count: countMap[c.id] ?? 0 })),
  });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  if (!body) return apiError('잘못된 요청입니다.', 'BAD_REQUEST', 400);

  const { stage_id, title, description, is_published, order_no } = body as {
    stage_id?: string;
    title?: string;
    description?: string;
    is_published?: boolean;
    order_no?: number;
  };
  if (!stage_id) return apiError('단계를 선택해주세요.', 'INVALID_STAGE', 400);
  if (!title?.trim()) return apiError('챕터 이름을 입력해주세요.', 'INVALID_TITLE', 400);

  const db = supabaseAdmin();
  let nextOrder = order_no;
  if (nextOrder === undefined || nextOrder === null || Number.isNaN(Number(nextOrder))) {
    const { data: maxNo } = await db
      .from('chapters')
      .select('order_no')
      .eq('stage_id', stage_id)
      .order('order_no', { ascending: false })
      .limit(1)
      .maybeSingle();
    nextOrder = (maxNo?.order_no ?? 0) + 1;
  }

  const { data, error } = await db
    .from('chapters')
    .insert({
      stage_id,
      title: title.trim(),
      description: description?.trim() ?? null,
      order_no: Number(nextOrder),
      is_published: is_published ?? true,
    })
    .select('*')
    .single();

  if (error) return apiError('챕터 등록 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
  return apiOk({ chapter: data }, 201);
}
