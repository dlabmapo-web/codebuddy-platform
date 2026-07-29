import { supabaseAdmin } from '@/lib/supabase/admin';
import { apiOk, apiError } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/requireAdmin';

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const db = supabaseAdmin();
  const { data: subjects, error } = await db
    .from('subjects')
    .select('*, stages(count)')
    .order('order_no', { ascending: true });

  if (error) return apiError('과목 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);

  return apiOk({
    subjects: (subjects ?? []).map(({ stages, ...subject }) => ({
      ...subject,
      stage_count: stages?.[0]?.count ?? 0,
    })),
  });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  if (!body) return apiError('잘못된 요청입니다.', 'BAD_REQUEST', 400);

  const { title, description, is_published, order_no } = body as {
    title?: string;
    description?: string;
    is_published?: boolean;
    order_no?: number;
  };
  if (!title?.trim()) return apiError('과목 이름을 입력해주세요.', 'INVALID_TITLE', 400);

  const db = supabaseAdmin();
  let nextOrder = order_no;
  if (nextOrder === undefined || nextOrder === null || Number.isNaN(Number(nextOrder))) {
    const { data: maxNo } = await db
      .from('subjects')
      .select('order_no')
      .order('order_no', { ascending: false })
      .limit(1)
      .maybeSingle();
    nextOrder = (maxNo?.order_no ?? 0) + 1;
  }

  const { data, error } = await db
    .from('subjects')
    .insert({
      title: title.trim(),
      description: description?.trim() ?? null,
      order_no: Number(nextOrder),
      is_published: is_published ?? true,
    })
    .select('*')
    .single();

  if (error) return apiError('과목 등록 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
  return apiOk({ subject: data }, 201);
}
