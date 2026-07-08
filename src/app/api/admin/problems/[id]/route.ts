import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { apiOk, apiError } from '@/lib/api/response';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  if (user.role !== 'admin') return apiError('권한이 없습니다.', 'FORBIDDEN', 403);

  const { id } = await params;
  const db = supabaseAdmin();

  const { data: problem, error } = await db
    .from('problems')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !problem) return apiError('문제를 찾을 수 없습니다.', 'NOT_FOUND', 404);

  const { data: test_cases } = await db
    .from('test_cases')
    .select('*')
    .eq('problem_id', id)
    .order('order_no', { ascending: true });

  const { data: hints } = await db
    .from('problem_hints')
    .select('*')
    .eq('problem_id', id)
    .order('order_no', { ascending: true });

  return apiOk({ problem, test_cases: test_cases ?? [], hints: hints ?? [] });
}

export async function PATCH(req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  if (user.role !== 'admin') return apiError('권한이 없습니다.', 'FORBIDDEN', 403);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return apiError('잘못된 요청입니다.', 'BAD_REQUEST', 400);

  const { test_cases, hints, ...fields } = body as {
    title?: string;
    difficulty?: string;
    description?: string;
    input_format?: string;
    output_format?: string;
    constraint_text?: string;
    starter_code?: string;
    time_limit_ms?: number;
    memory_limit_mb?: number;
    is_published?: boolean;
    use_ai_feedback?: boolean;
    category_id?: string;
    order_no?: number;
    test_cases?: Array<{ input: string; expected_output: string; is_sample: boolean; is_hidden: boolean; order_no: number }>;
    hints?: Array<{ hint_text: string; trigger_pattern?: string; order_no: number }>;
  };

  const db = supabaseAdmin();

  const updateFields: Record<string, unknown> = {};
  if (fields.title !== undefined) updateFields.title = fields.title.trim();
  if (fields.difficulty !== undefined) updateFields.difficulty = fields.difficulty;
  if (fields.description !== undefined) updateFields.description = fields.description.trim();
  if (fields.input_format !== undefined) updateFields.input_format = fields.input_format;
  if (fields.output_format !== undefined) updateFields.output_format = fields.output_format;
  if (fields.constraint_text !== undefined) updateFields.constraint_text = fields.constraint_text;
  if (fields.starter_code !== undefined) updateFields.starter_code = fields.starter_code;
  if (fields.time_limit_ms !== undefined) updateFields.time_limit_ms = fields.time_limit_ms;
  if (fields.memory_limit_mb !== undefined) updateFields.memory_limit_mb = fields.memory_limit_mb;
  if (fields.is_published !== undefined) updateFields.is_published = fields.is_published;
  if (fields.use_ai_feedback !== undefined) updateFields.use_ai_feedback = fields.use_ai_feedback;
  if (fields.category_id !== undefined) updateFields.category_id = fields.category_id;
  if (fields.order_no !== undefined) updateFields.order_no = fields.order_no;

  if (Object.keys(updateFields).length > 0) {
    const { error } = await db.from('problems').update(updateFields).eq('id', id);
    if (error) return apiError('문제 수정 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
  }

  if (test_cases !== undefined) {
    await db.from('test_cases').delete().eq('problem_id', id);
    if (test_cases.length > 0) {
      await db.from('test_cases').insert(test_cases.map((tc) => ({ ...tc, problem_id: id })));
    }
  }

  if (hints !== undefined) {
    await db.from('problem_hints').delete().eq('problem_id', id);
    if (hints.length > 0) {
      await db.from('problem_hints').insert(hints.map((h) => ({ ...h, problem_id: id })));
    }
  }

  const { data: updated } = await db.from('problems').select('*').eq('id', id).single();
  return apiOk({ problem: updated });
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  if (user.role !== 'admin') return apiError('권한이 없습니다.', 'FORBIDDEN', 403);

  const { id } = await params;
  const db = supabaseAdmin();

  const { error } = await db.from('problems').delete().eq('id', id);
  if (error) return apiError('문제 삭제 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);

  return apiOk({ message: '문제가 삭제되었습니다.' });
}
