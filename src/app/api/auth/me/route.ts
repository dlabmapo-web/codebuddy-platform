import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  const { data } = await supabaseAdmin()
    .from('users')
    .select('id, username, name, role, last_active_at, created_at')
    .eq('id', user.id)
    .single();

  return NextResponse.json({ user: data });
}
