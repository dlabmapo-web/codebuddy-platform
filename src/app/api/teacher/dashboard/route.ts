import { getCurrentUser } from '@/lib/auth/session';
import { apiError, apiOk } from '@/lib/api/response';
import { supabaseAdmin } from '@/lib/supabase/admin';
import type {
  AiErrorCategoryPoint,
  DashboardRange,
  ProblemPerformancePoint,
  StudentActivityPoint,
  StudentNeedingHelp,
  SubmissionTrendPoint,
  TeacherDashboardData,
} from '@/lib/types/teacherDashboard';

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

type StudentRow = {
  id: string;
  name: string;
  username: string;
};

type SubmissionRow = {
  user_id: string;
  problem_id: string;
  status: 'pass' | 'fail' | 'partial';
  submitted_at: string;
};

type ProblemRow = {
  id: string;
  problem_no: number;
  title: string;
};

type AiFeedbackRow = {
  ai_feedback_patterns:
    | { error_category: string | null; pattern_type: string | null }
    | Array<{ error_category: string | null; pattern_type: string | null }>
    | null;
};

function parseRange(value: string | null): DashboardRange {
  return value === '7d' || value === 'all' ? value : '30d';
}

function dateKey(date: Date) {
  return DATE_FORMATTER.format(date);
}

function rangeStart(range: DashboardRange, now: Date) {
  if (range === 'all') return null;
  const days = range === '7d' ? 7 : 30;
  const firstDay = new Date(now.getTime() - (days - 1) * DAY_MS);
  return `${dateKey(firstDay)}T00:00:00+09:00`;
}

function buildTrend(submissions: SubmissionRow[], range: DashboardRange, now: Date): SubmissionTrendPoint[] {
  const buckets = new Map<string, SubmissionTrendPoint>();

  if (range !== 'all') {
    const days = range === '7d' ? 7 : 30;
    for (let offset = days - 1; offset >= 0; offset--) {
      const key = dateKey(new Date(now.getTime() - offset * DAY_MS));
      const [, month, day] = key.split('-');
      buckets.set(key, { period: key, label: `${Number(month)}/${Number(day)}`, pass: 0, fail: 0 });
    }
  }

  for (const submission of submissions) {
    const fullDate = dateKey(new Date(submission.submitted_at));
    const key = range === 'all' ? fullDate.slice(0, 7) : fullDate;
    let point = buckets.get(key);
    if (!point) {
      const [year, month] = key.split('-');
      point = {
        period: key,
        label: range === 'all' ? `${year}.${Number(month)}` : key,
        pass: 0,
        fail: 0,
      };
      buckets.set(key, point);
    }
    if (submission.status === 'pass') point.pass++;
    if (submission.status === 'fail') point.fail++;
  }

  return Array.from(buckets.values()).sort((a, b) => a.period.localeCompare(b.period));
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  if (user.role !== 'teacher') return apiError('권한이 없습니다.', 'FORBIDDEN', 403);

  const range = parseRange(new URL(req.url).searchParams.get('range'));
  const now = new Date();
  const from = rangeStart(range, now);
  const db = supabaseAdmin();

  const { data: mappings, error: mappingError } = await db
    .from('teacher_student')
    .select('student_id')
    .eq('teacher_id', user.id);

  if (mappingError) return apiError('담당 학생 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);

  const mappedIds = (mappings ?? []).map((mapping) => mapping.student_id);
  let studentQuery = db
    .from('users')
    .select('id, name, username')
    .eq('role', 'student')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (mappedIds.length > 0) studentQuery = studentQuery.in('id', mappedIds);

  const { data: studentData, error: studentError } = await studentQuery;
  if (studentError) return apiError('학생 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);

  const students = (studentData ?? []) as StudentRow[];
  const studentIds = students.map((student) => student.id);
  const empty: TeacherDashboardData = {
    range,
    summary: {
      totalStudents: 0,
      totalSubmissions: 0,
      totalWrongAnswers: 0,
      solvedProblemPairs: 0,
      solveRate: 0,
    },
    submissionTrend: [],
    problemPerformance: [],
    studentActivity: [],
    aiErrorCategories: [],
    studentsNeedingHelp: [],
  };

  if (studentIds.length === 0) return apiOk({ ...empty });

  let submissionQuery = db
    .from('submissions')
    .select('user_id, problem_id, status, submitted_at')
    .in('user_id', studentIds);
  let aiFeedbackQuery = db
    .from('ai_feedbacks')
    .select('ai_feedback_patterns(error_category, pattern_type)')
    .in('student_id', studentIds);

  if (from) {
    submissionQuery = submissionQuery.gte('submitted_at', from);
    aiFeedbackQuery = aiFeedbackQuery.gte('created_at', from);
  }

  const [submissionResult, problemResult, aiFeedbackResult] = await Promise.all([
    submissionQuery,
    db.from('problems').select('id, problem_no, title').eq('is_published', true),
    aiFeedbackQuery,
  ]);

  if (submissionResult.error) return apiError('제출 통계 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
  if (problemResult.error) return apiError('문제 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
  if (aiFeedbackResult.error) return apiError('AI 피드백 통계 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);

  const submissions = (submissionResult.data ?? []) as SubmissionRow[];
  const problems = (problemResult.data ?? []) as ProblemRow[];
  const aiFeedbacks = (aiFeedbackResult.data ?? []) as AiFeedbackRow[];
  const studentMap = new Map(students.map((student) => [student.id, student]));
  const problemMap = new Map(problems.map((problem) => [problem.id, problem]));

  const pairStats = new Map<string, { studentId: string; problemId: string; attempts: number; solved: boolean; wrong: number }>();
  const studentStats = new Map<string, { submissions: number; wrong: number; attempted: Set<string>; solved: Set<string> }>();
  const problemStats = new Map<string, { submissions: number; wrong: number; attempted: Set<string>; solved: Set<string> }>();

  for (const submission of submissions) {
    const pairKey = `${submission.user_id}:${submission.problem_id}`;
    const pair = pairStats.get(pairKey) ?? {
      studentId: submission.user_id,
      problemId: submission.problem_id,
      attempts: 0,
      solved: false,
      wrong: 0,
    };
    pair.attempts++;
    if (submission.status === 'pass') pair.solved = true;
    if (submission.status === 'fail') pair.wrong++;
    pairStats.set(pairKey, pair);

    const student = studentStats.get(submission.user_id) ?? {
      submissions: 0,
      wrong: 0,
      attempted: new Set<string>(),
      solved: new Set<string>(),
    };
    student.submissions++;
    student.attempted.add(submission.problem_id);
    if (submission.status === 'pass') student.solved.add(submission.problem_id);
    if (submission.status === 'fail') student.wrong++;
    studentStats.set(submission.user_id, student);

    const problem = problemStats.get(submission.problem_id) ?? {
      submissions: 0,
      wrong: 0,
      attempted: new Set<string>(),
      solved: new Set<string>(),
    };
    problem.submissions++;
    problem.attempted.add(submission.user_id);
    if (submission.status === 'pass') problem.solved.add(submission.user_id);
    if (submission.status === 'fail') problem.wrong++;
    problemStats.set(submission.problem_id, problem);
  }

  const solvedPairs = Array.from(pairStats.values()).filter((pair) => pair.solved).length;
  const attemptedPairs = pairStats.size;

  const studentActivity: StudentActivityPoint[] = students
    .map((student) => {
      const stat = studentStats.get(student.id);
      const attemptedCount = stat?.attempted.size ?? 0;
      const solvedCount = stat?.solved.size ?? 0;
      return {
        studentId: student.id,
        name: student.name,
        username: student.username,
        submissionCount: stat?.submissions ?? 0,
        solvedCount,
        wrongAnswerCount: stat?.wrong ?? 0,
        solveRate: attemptedCount > 0 ? Math.round((solvedCount / attemptedCount) * 100) : 0,
      };
    })
    .sort((a, b) => b.submissionCount - a.submissionCount || b.solvedCount - a.solvedCount)
    .slice(0, 8);

  const problemPerformance: ProblemPerformancePoint[] = Array.from(problemStats.entries())
    .map(([problemId, stat]) => {
      const problem = problemMap.get(problemId);
      const attemptedStudents = stat.attempted.size;
      const solvedStudents = stat.solved.size;
      return {
        problemId,
        label: problem ? `${problem.problem_no}. ${problem.title}` : '삭제된 문제',
        title: problem?.title ?? '삭제된 문제',
        attemptedStudents,
        solvedStudents,
        solveRate: attemptedStudents > 0 ? Math.round((solvedStudents / attemptedStudents) * 100) : 0,
        submissionCount: stat.submissions,
        wrongAnswerCount: stat.wrong,
      };
    })
    .sort((a, b) => {
      const aReliable = a.attemptedStudents >= 3 ? 1 : 0;
      const bReliable = b.attemptedStudents >= 3 ? 1 : 0;
      return bReliable - aReliable || a.solveRate - b.solveRate || b.submissionCount - a.submissionCount;
    })
    .slice(0, 8);

  const categoryCounts = new Map<string, number>();
  for (const feedback of aiFeedbacks) {
    const relation = Array.isArray(feedback.ai_feedback_patterns)
      ? feedback.ai_feedback_patterns[0]
      : feedback.ai_feedback_patterns;
    const category = relation?.error_category?.trim() || relation?.pattern_type?.trim();
    if (category) categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
  }
  const aiErrorCategories: AiErrorCategoryPoint[] = Array.from(categoryCounts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const studentsNeedingHelp: StudentNeedingHelp[] = Array.from(studentStats.entries())
    .map(([studentId, stat]) => {
      const student = studentMap.get(studentId);
      const attemptedCount = stat.attempted.size;
      const solvedCount = stat.solved.size;
      return {
        studentId,
        name: student?.name ?? '알 수 없음',
        username: student?.username ?? '',
        submissionCount: stat.submissions,
        wrongAnswerCount: stat.wrong,
        solvedCount,
        solveRate: attemptedCount > 0 ? Math.round((solvedCount / attemptedCount) * 100) : 0,
      };
    })
    .filter((student) => student.wrongAnswerCount >= 2 && student.solveRate < 60)
    .sort((a, b) => b.wrongAnswerCount - a.wrongAnswerCount || a.solveRate - b.solveRate)
    .slice(0, 5);

  const response: TeacherDashboardData = {
    range,
    summary: {
      totalStudents: students.length,
      totalSubmissions: submissions.length,
      totalWrongAnswers: submissions.filter((submission) => submission.status === 'fail').length,
      solvedProblemPairs: solvedPairs,
      solveRate: attemptedPairs > 0 ? Math.round((solvedPairs / attemptedPairs) * 100) : 0,
    },
    submissionTrend: buildTrend(submissions, range, now),
    problemPerformance,
    studentActivity,
    aiErrorCategories,
    studentsNeedingHelp,
  };

  return apiOk({ ...response });
}
