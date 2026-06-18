import { supabaseAdmin } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth/session';
import { verifyPassword, hashPassword } from '@/lib/auth/password';
import { apiError, apiOk } from '@/lib/api/response';

export async function PATCH(req: Request) {
  const session = await getCurrentUser();
  if (!session) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);

  const body = await req.json().catch(() => null);
  if (!body) return apiError('잘못된 요청입니다.', 'BAD_REQUEST', 400);

  const { name, currentPassword, newPassword } = body as {
    name?: string;
    currentPassword?: string;
    newPassword?: string;
  };

  const hasNameChange = typeof name === 'string';
  const hasPasswordChange = typeof newPassword === 'string';

  if (!hasNameChange && !hasPasswordChange) {
    return apiError('변경할 항목이 없습니다.', 'NOTHING_TO_UPDATE', 400);
  }
  if (hasNameChange && name!.trim().length === 0) {
    return apiError('이름을 입력해주세요.', 'INVALID_NAME', 400);
  }
  if (hasPasswordChange) {
    if (!currentPassword) {
      return apiError('현재 비밀번호를 입력해주세요.', 'MISSING_CURRENT_PASSWORD', 400);
    }
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(newPassword!)) {
      return apiError(
        '새 비밀번호는 영문과 숫자를 포함하여 8자 이상이어야 합니다.',
        'INVALID_PASSWORD',
        400
      );
    }
  }

  const db = supabaseAdmin();

  const { data: user } = await db
    .from('users')
    .select('password_hash')
    .eq('id', session.id)
    .single();

  if (!user) return apiError('사용자를 찾을 수 없습니다.', 'USER_NOT_FOUND', 404);

  if (hasPasswordChange) {
    const valid = await verifyPassword(currentPassword!, user.password_hash);
    if (!valid) {
      return apiError('현재 비밀번호가 올바르지 않습니다.', 'WRONG_CURRENT_PASSWORD', 400);
    }
    if (currentPassword === newPassword) {
      return apiError(
        '새 비밀번호는 현재 비밀번호와 달라야 합니다.',
        'SAME_PASSWORD',
        400
      );
    }
  }

  const updates: Record<string, string> = {};
  if (hasNameChange) updates.name = name!.trim();
  if (hasPasswordChange) updates.password_hash = await hashPassword(newPassword!);

  const { data: updated, error } = await db
    .from('users')
    .update(updates)
    .eq('id', session.id)
    .select('id, username, name, role')
    .single();

  if (error || !updated) {
    return apiError('정보 변경 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
  }

  return apiOk({ user: updated });
}
