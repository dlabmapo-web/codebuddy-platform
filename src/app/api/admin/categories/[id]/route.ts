import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { apiOk, apiError } from '@/lib/api/response';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  if (user.role !== 'admin') return apiError('권한이 없습니다.', 'FORBIDDEN', 403);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return apiError('잘못된 요청입니다.', 'BAD_REQUEST', 400);

  const { title, description, is_published, order_no } = body as {
    title?: string;
    description?: string;
    is_published?: boolean;
    order_no?: number;
  };

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (title !== undefined) updates.title = title.trim();
  if (description !== undefined) updates.description = description?.trim() ?? null;
  if (is_published !== undefined) updates.is_published = is_published;
  if (order_no !== undefined) updates.order_no = order_no;

  const db = supabaseAdmin();
  const { data, error } = await db.from('categories').update(updates).eq('id', id).select('*').single();
  if (error) return apiError('카테고리 수정 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
  return apiOk({ category: data });
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  if (user.role !== 'admin') return apiError('권한이 없습니다.', 'FORBIDDEN', 403);

  const { id } = await params;
  const db = supabaseAdmin();

  const { count } = await db
    .from('problems')
    .select('id', { count: 'exact', head: true })
    .eq('category_id', id);

  if ((count ?? 0) > 0) {
    return apiError('이 카테고리에 속한 문제가 있어 삭제할 수 없습니다. 문제를 먼저 옮기거나 삭제해주세요.', 'CATEGORY_NOT_EMPTY', 400);
  }

  const { error } = await db.from('categories').delete().eq('id', id);
  if (error) return apiError('카테고리 삭제 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
  return apiOk({ message: '카테고리가 삭제되었습니다.' });
}
