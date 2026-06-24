import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { apiOk, apiError } from '@/lib/api/response';
import { hashPassword } from '@/lib/auth/password';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  if (user.role !== 'admin') return apiError('권한이 없습니다.', 'FORBIDDEN', 403);

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return apiError('잘못된 요청입니다.', 'BAD_REQUEST', 400);

  const db = supabaseAdmin();

  const { data: target } = await db.from('users').select('id, role').eq('id', id).single();
  if (!target) return apiError('사용자를 찾을 수 없습니다.', 'NOT_FOUND', 404);
  if (target.role === 'admin') return apiError('관리자 계정은 수정할 수 없습니다.', 'FORBIDDEN', 403);

  const { name, role, is_active, new_password } = body as {
    name?: string;
    role?: string;
    is_active?: boolean;
    new_password?: string;
  };

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) {
    if (!name.trim()) return apiError('이름을 입력해주세요.', 'INVALID_NAME', 400);
    updates.name = name.trim();
  }
  if (role !== undefined) {
    if (!['student', 'teacher'].includes(role)) return apiError('올바른 역할을 선택해주세요.', 'INVALID_ROLE', 400);
    updates.role = role;
  }
  if (is_active !== undefined) {
    updates.is_active = is_active;
    if (!is_active) {
      await db.from('user_sessions').update({ is_active: false }).eq('user_id', id);
    }
  }
  if (new_password !== undefined) {
    if (new_password.length < 8) return apiError('비밀번호는 8자 이상이어야 합니다.', 'INVALID_PASSWORD', 400);
    updates.password_hash = await hashPassword(new_password);
  }

  const { data: updated, error } = await db.from('users').update(updates).eq('id', id).select('id, username, name, role, is_active, last_active_at, created_at').single();
  if (error) return apiError('사용자 정보 수정 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);

  return apiOk({ user: updated });
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  if (user.role !== 'admin') return apiError('권한이 없습니다.', 'FORBIDDEN', 403);

  const { id } = await params;
  const db = supabaseAdmin();

  const { data: target } = await db.from('users').select('id, role').eq('id', id).single();
  if (!target) return apiError('사용자를 찾을 수 없습니다.', 'NOT_FOUND', 404);
  if (target.role === 'admin') return apiError('관리자 계정은 삭제할 수 없습니다.', 'FORBIDDEN', 403);

  const { error } = await db.from('users').delete().eq('id', id);
  if (error) return apiError('사용자 삭제 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);

  return apiOk({ success: true });
}
