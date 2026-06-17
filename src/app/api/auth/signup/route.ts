import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { hashPassword } from '@/lib/auth/password';
import type { UserRole } from '@/lib/types/db';

const ALLOWED_ROLES: UserRole[] = ['student', 'teacher'];

function isValidUsername(u: string) {
  return u.length >= 5;
}

function isValidPassword(p: string) {
  return /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(p);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const { username, password, name, role } = body as {
    username?: string;
    password?: string;
    name?: string;
    role?: string;
  };

  if (!username || !password || !name || !role) {
    return NextResponse.json({ error: '모든 필드를 입력해주세요.' }, { status: 400 });
  }
  if (!isValidUsername(username)) {
    return NextResponse.json({ error: '아이디는 5자 이상이어야 합니다.' }, { status: 400 });
  }
  if (!isValidPassword(password)) {
    return NextResponse.json(
      { error: '비밀번호는 영문과 숫자를 포함하여 8자 이상이어야 합니다.' },
      { status: 400 }
    );
  }
  if (!ALLOWED_ROLES.includes(role as UserRole)) {
    return NextResponse.json({ error: '허용되지 않은 역할입니다.' }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: existing } = await db
    .from('users')
    .select('id')
    .eq('username', username)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: '이미 사용 중인 아이디입니다.' }, { status: 409 });
  }

  const password_hash = await hashPassword(password);

  const { data: user, error } = await db
    .from('users')
    .insert({ username, password_hash, name, role })
    .select('id, username, name, role')
    .single();

  if (error) {
    return NextResponse.json({ error: '가입 중 오류가 발생했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ user }, { status: 201 });
}
