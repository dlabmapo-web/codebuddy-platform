import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

  const db = supabaseAdmin();

  if (user.role === 'student') {
    const { data, error } = await db
      .from('collaboration_sessions')
      .select('*')
      .eq('student_id', user.id)
      .order('started_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ sessions: data });
  }

  if (user.role === 'teacher') {
    const { data, error } = await db
      .from('collaboration_sessions')
      .select('*')
      .eq('teacher_id', user.id)
      .order('started_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ sessions: data });
  }

  const { data, error } = await db
    .from('collaboration_sessions')
    .select('*')
    .order('started_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sessions: data });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });

  const { problem_id, student_id, teacher_id } = body;

  const { data, error } = await supabaseAdmin()
    .from('collaboration_sessions')
    .insert({
      problem_id: problem_id ?? null,
      student_id: student_id ?? user.id,
      teacher_id: teacher_id ?? null,
      status: 'active',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session: data }, { status: 201 });
}
