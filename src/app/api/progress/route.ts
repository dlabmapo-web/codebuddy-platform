import { getCurrentUser } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { apiOk, apiError } from '@/lib/api/response';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  if (user.role !== 'teacher' && user.role !== 'admin') {
    return apiError('권한이 없습니다.', 'FORBIDDEN', 403);
  }

  const db = supabaseAdmin();

  const { data: problems, error: probErr } = await db
    .from('problems')
    .select('id, problem_no, title, difficulty')
    .eq('is_published', true)
    .order('problem_no', { ascending: true });

  if (probErr) return apiError('문제 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);

  const problemIds = (problems ?? []).map(p => p.id);
  if (problemIds.length === 0) return apiOk({ problems: [] });

  const { data: submissions, error: subErr } = await db
    .from('submissions')
    .select('problem_id, status, user_id, elapsed_sec')
    .in('problem_id', problemIds);

  if (subErr) return apiError('제출 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);

  const statsMap: Record<string, { total: number; passed: number; students: Set<string>; totalElapsed: number; elapsedCount: number }> = {};
  for (const s of submissions ?? []) {
    if (!statsMap[s.problem_id]) {
      statsMap[s.problem_id] = { total: 0, passed: 0, students: new Set(), totalElapsed: 0, elapsedCount: 0 };
    }
    const stat = statsMap[s.problem_id];
    stat.total++;
    stat.students.add(s.user_id);
    if (s.status === 'pass') stat.passed++;
    if (s.elapsed_sec) { stat.totalElapsed += s.elapsed_sec; stat.elapsedCount++; }
  }

  const result = (problems ?? []).map(p => {
    const stat = statsMap[p.id];
    const studentCount = stat?.students.size ?? 0;
    const total = stat?.total ?? 0;
    const passed = stat?.passed ?? 0;
    const avgElapsed = stat && stat.elapsedCount > 0 ? Math.round(stat.totalElapsed / stat.elapsedCount) : null;
    return {
      id: p.id,
      problem_no: p.problem_no,
      title: p.title,
      difficulty: p.difficulty,
      student_count: studentCount,
      submission_count: total,
      pass_count: passed,
      pass_rate: total > 0 ? Math.round((passed / total) * 100) : 0,
      avg_elapsed_sec: avgElapsed,
    };
  });

  return apiOk({ problems: result });
}
