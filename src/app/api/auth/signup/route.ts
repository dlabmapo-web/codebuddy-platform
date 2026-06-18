import { supabaseAdmin } from '@/lib/supabase/admin';
import { hashPassword } from '@/lib/auth/password';
import { apiError, apiOk } from '@/lib/api/response';
import type { UserRole } from '@/lib/types/db';

const ALLOWED_ROLES: UserRole[] = ['student', 'teacher'];

function isValidUsername(u: string) {
  return /^[a-zA-Z0-9]{5,}$/.test(u);
}

function isValidPassword(p: string) {
  return /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(p);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) return apiError('잘못된 요청입니다.', 'BAD_REQUEST', 400);

  const { username, password, name, role } = body as {
    username?: string;
    password?: string;
    name?: string;
    role?: string;
  };

  if (!username || !password || !name || !role) {
    return apiError('모든 필드를 입력해주세요.', 'MISSING_FIELDS', 400);
  }
  if (!isValidUsername(username)) {
    return apiError(
      '아이디는 영문·숫자 조합 5자 이상이어야 합니다.',
      'INVALID_USERNAME',
      400
    );
  }
  if (!isValidPassword(password)) {
    return apiError(
      '비밀번호는 영문과 숫자를 포함하여 8자 이상이어야 합니다.',
      'INVALID_PASSWORD',
      400
    );
  }
  if (!ALLOWED_ROLES.includes(role as UserRole)) {
    return apiError('허용되지 않은 역할입니다.', 'INVALID_ROLE', 400);
  }
  if (name.trim().length === 0) {
    return apiError('이름을 입력해주세요.', 'MISSING_NAME', 400);
  }

  const db = supabaseAdmin();
  const { data: existing } = await db
    .from('users')
    .select('id')
    .eq('username', username)
    .maybeSingle();

  if (existing) {
    return apiError('이미 사용 중인 아이디입니다.', 'DUPLICATE_USERNAME', 409);
  }

  const password_hash = await hashPassword(password);

  const { data: user, error } = await db
    .from('users')
    .insert({ username, password_hash, name: name.trim(), role })
    .select('id, username, name, role')
    .single();

  if (error || !user) {
    return apiError('가입 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
  }

  return apiOk({ user }, 201);
}
