import { supabaseAdmin } from '@/lib/supabase/admin';
import { hashPassword } from '@/lib/auth/password';
import { apiOk, apiError } from '@/lib/api/response';

export async function POST() {
  const db = supabaseAdmin();

  const { data: existing } = await db
    .from('users')
    .select('id')
    .eq('username', 'admin')
    .maybeSingle();

  if (existing) {
    return apiError('관리자 계정이 이미 존재합니다.', 'ALREADY_EXISTS', 409);
  }

  const passwordHash = await hashPassword('admin');

  const { error } = await db.from('users').insert({
    username: 'admin',
    password_hash: passwordHash,
    name: '관리자',
    role: 'admin',
    is_active: true,
  });

  if (error) {
    return apiError('계정 생성 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
  }

  return apiOk({ message: '관리자 계정이 생성되었습니다.' });
}
