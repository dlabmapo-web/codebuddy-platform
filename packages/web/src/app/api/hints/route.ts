import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import OpenAI from 'openai';

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });

  const { problem_id, student_code, error_message, submission_id } = body as {
    problem_id?: string;
    student_code?: string;
    error_message?: string;
    submission_id?: string;
  };

  if (!problem_id || !student_code) {
    return NextResponse.json({ error: '필수 필드가 누락되었습니다.' }, { status: 400 });
  }

  const db = supabaseAdmin();

  const { data: problem } = await db
    .from('problems')
    .select('title, description, problem_hints(hint_text, trigger_pattern, order_no)')
    .eq('id', problem_id)
    .single();

  const hints = (problem?.problem_hints ?? []) as Array<{
    hint_text: string;
    trigger_pattern: string | null;
    order_no: number;
  }>;

  let matchedHintId: string | null = null;
  let hintContext = '';

  if (hints.length > 0) {
    const sorted = [...hints].sort((a, b) => a.order_no - b.order_no);
    const matched = sorted.find((h) => {
      if (!h.trigger_pattern) return false;
      try {
        return new RegExp(h.trigger_pattern, 'i').test(student_code + (error_message ?? ''));
      } catch {
        return false;
      }
    });
    if (matched) {
      hintContext = `관련 힌트: ${matched.hint_text}`;
    }
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const systemPrompt = `너는 코딩 교육 플랫폼의 AI 튜터다. 학생의 코드를 보고 정답을 알려주지 않으면서 방향을 제시하는 힌트를 한국어로 2~3문장으로 제공한다. ${hintContext}`;

  const userPrompt = `문제: ${problem?.title ?? ''}
설명: ${problem?.description ?? ''}
학생 코드:
\`\`\`python
${student_code}
\`\`\`
${error_message ? `오류 메시지: ${error_message}` : ''}`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 300,
  });

  const hintResponse = completion.choices[0]?.message?.content ?? '';

  await db.from('ai_hint_logs').insert({
    user_id: user.id,
    problem_id,
    submission_id: submission_id ?? null,
    matched_hint_id: matchedHintId,
    student_code,
    error_message: error_message ?? null,
    hint_response: hintResponse,
    model: 'gpt-4o-mini',
  });

  return NextResponse.json({ hint: hintResponse });
}
