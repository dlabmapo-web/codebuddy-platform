import { supabaseAdmin } from '@/lib/supabase/admin';
import { apiOk, apiError } from '@/lib/api/response';
import { requireAdmin } from '@/lib/api/requireAdmin';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return apiError('잘못된 요청입니다.', 'BAD_REQUEST', 400);

  const { title, description, is_published, order_no, subject_id } = body as {
    title?: string;
    description?: string;
    is_published?: boolean;
    order_no?: number;
    subject_id?: string;
  };

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (title !== undefined) updates.title = title.trim();
  if (description !== undefined) updates.description = description?.trim() ?? null;
  if (is_published !== undefined) updates.is_published = is_published;
  if (order_no !== undefined) updates.order_no = order_no;
  if (subject_id !== undefined) updates.subject_id = subject_id;

  const db = supabaseAdmin();
  const { data, error } = await db.from('stages').update(updates).eq('id', id).select('*').single();
  if (error) return apiError('단계 수정 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
  return apiOk({ stage: data });
}

export async function DELETE(_req: Request, { params }: Params) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const { id } = await params;
  const db = supabaseAdmin();

  const { count } = await db
    .from('chapters')
    .select('id', { count: 'exact', head: true })
    .eq('stage_id', id);

  if ((count ?? 0) > 0) {
    return apiError('이 단계에 속한 챕터가 있어 삭제할 수 없습니다. 챕터를 먼저 삭제해주세요.', 'STAGE_NOT_EMPTY', 400);
  }

  const { error } = await db.from('stages').delete().eq('id', id);
  if (error) return apiError('단계 삭제 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
  return apiOk({ message: '단계가 삭제되었습니다.' });
}
