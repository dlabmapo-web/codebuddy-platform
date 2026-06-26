import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { apiOk, apiError } from '@/lib/api/response';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  if (user.role !== 'admin') return apiError('권한이 없습니다.', 'FORBIDDEN', 403);

  const db = supabaseAdmin();
  const { data: categories, error } = await db
    .from('categories')
    .select('*')
    .order('order_no', { ascending: true });

  if (error) return apiError('카테고리 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);

  const { data: problems } = await db.from('problems').select('id, category_id');
  const countMap: Record<string, number> = {};
  for (const p of problems ?? []) {
    if (p.category_id) countMap[p.category_id] = (countMap[p.category_id] ?? 0) + 1;
  }

  const result = (categories ?? []).map((c) => ({ ...c, problem_count: countMap[c.id] ?? 0 }));
  return apiOk({ categories: result });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  if (user.role !== 'admin') return apiError('권한이 없습니다.', 'FORBIDDEN', 403);

  const body = await req.json().catch(() => null);
  if (!body) return apiError('잘못된 요청입니다.', 'BAD_REQUEST', 400);

  const { title, description, is_published } = body as { title?: string; description?: string; is_published?: boolean };
  if (!title?.trim()) return apiError('카테고리 이름을 입력해주세요.', 'INVALID_TITLE', 400);

  const db = supabaseAdmin();
  const { data: maxNo } = await db
    .from('categories')
    .select('order_no')
    .order('order_no', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await db
    .from('categories')
    .insert({
      title: title.trim(),
      description: description?.trim() ?? null,
      order_no: (maxNo?.order_no ?? 0) + 1,
      is_published: is_published ?? true,
    })
    .select('*')
    .single();

  if (error) return apiError('카테고리 등록 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
  return apiOk({ category: data }, 201);
}
