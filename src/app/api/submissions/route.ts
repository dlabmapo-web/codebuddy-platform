import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { apiOk, apiError } from '@/lib/api/response';
import { NextRequest } from 'next/server';
import {
  startSubmission,
  SubmissionValidationError,
} from '@/lib/judge/submissionService';
import { canTeacherMonitorStudent } from '@/lib/monitoring/teacherAccess.server';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  if (user.role === 'admin') return apiError('권한이 없습니다.', 'FORBIDDEN', 403);

  const { searchParams } = new URL(req.url);
  const problemId = searchParams.get('problem_id');
  const studentId = searchParams.get('student_id');
  const view = searchParams.get('view');

  const db = supabaseAdmin();

  if (view === 'count') {
    const targetUserId = user.role === 'teacher' && studentId
      ? studentId
      : user.id;
    if (user.role === 'teacher') {
      if (!studentId) {
        return apiError('학생 ID가 필요합니다.', 'BAD_REQUEST', 400);
      }
      const access = await canTeacherMonitorStudent(user.id, studentId);
      if (!access.allowed) {
        return apiError(
          access.reason === 'query_failed'
            ? '담당 학생 확인 중 오류가 발생했습니다.'
            : '권한이 없습니다.',
          access.reason === 'query_failed' ? 'INTERNAL_ERROR' : 'FORBIDDEN',
          access.reason === 'query_failed' ? 500 : 403,
        );
      }
    }

    let countQuery = db
      .from('submissions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', targetUserId)
      .in('status', ['pass', 'fail', 'partial']);
    if (problemId) countQuery = countQuery.eq('problem_id', problemId);
    const { count, error } = await countQuery;
    if (error) {
      return apiError('제출 횟수 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
    }
    return apiOk({ count: count ?? 0 });
  }

  if (user.role === 'student' && view === 'history') {
    const limit = Math.min(
      Math.max(Number.parseInt(searchParams.get('limit') ?? '20', 10) || 20, 1),
      50,
    );
    const offset = Math.max(
      Number.parseInt(searchParams.get('offset') ?? '0', 10) || 0,
      0,
    );
    const status = searchParams.get('status');
    const subjectId = searchParams.get('subject');
    const stageId = searchParams.get('stage');
    const chapterId = searchParams.get('chapter');

    const [statsResult, subjectResult, stageResult, chapterResult, problemResult] = await Promise.all([
      db
        .from('submissions')
        .select('problem_id, status')
        .eq('user_id', user.id)
        .in('status', ['pass', 'fail', 'partial']),
      db
        .from('subjects')
        .select('id, title, order_no')
        .eq('is_published', true)
        .order('order_no', { ascending: true }),
      db
        .from('stages')
        .select('id, title, order_no, subject_id')
        .eq('is_published', true)
        .order('order_no', { ascending: true }),
      db
        .from('chapters')
        .select('id, title, order_no, stage_id')
        .eq('is_published', true)
        .order('order_no', { ascending: true }),
      db
        .from('problems')
        .select('id, chapter_id')
        .eq('is_published', true),
    ]);
    if (
      statsResult.error
      || subjectResult.error
      || stageResult.error
      || chapterResult.error
      || problemResult.error
    ) {
      return apiError('풀이 기록 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
    }

    const allowedStageIds = new Set(
      (stageResult.data ?? [])
        .filter((stage) => !subjectId || stage.subject_id === subjectId)
        .map((stage) => stage.id),
    );
    const allowedChapterIds = new Set(
      (chapterResult.data ?? [])
        .filter((chapter) => (
          (!stageId || chapter.stage_id === stageId)
          && (!subjectId || allowedStageIds.has(chapter.stage_id))
          && (!chapterId || chapter.id === chapterId)
        ))
        .map((chapter) => chapter.id),
    );
    const hasCurriculumFilter = Boolean(subjectId || stageId || chapterId);
    const allowedProblemIds = (problemResult.data ?? [])
      .filter((problem) => (
        !hasCurriculumFilter
        || (problem.chapter_id && allowedChapterIds.has(problem.chapter_id))
      ))
      .map((problem) => problem.id);

    let historyQuery = db
      .from('submissions')
      .select(`
        id, problem_id, status, score, passed_count, total_count, runtime_ms, elapsed_sec, submitted_at,
        problems(
          problem_no, title, difficulty, order_no, chapter_id,
          chapters(
            id, title, order_no, stage_id,
            stages(
              id, title, order_no, subject_id,
              subjects(id, title, order_no)
            )
          )
        )
      `, { count: 'exact' })
      .eq('user_id', user.id)
      .in('status', status === 'pass'
        ? ['pass']
        : status === 'fail'
          ? ['fail', 'partial']
          : ['pass', 'fail', 'partial'])
      .order('submitted_at', { ascending: false });
    if (hasCurriculumFilter) {
      if (allowedProblemIds.length === 0) {
        return apiOk({
          submissions: [],
          summary: {
            total: statsResult.data?.length ?? 0,
            passed: (statsResult.data ?? []).filter((item) => item.status === 'pass').length,
            solved: new Set(
              (statsResult.data ?? [])
                .filter((item) => item.status === 'pass')
                .map((item) => item.problem_id),
            ).size,
          },
          curriculum: {
            subjects: subjectResult.data ?? [],
            stages: stageResult.data ?? [],
            chapters: chapterResult.data ?? [],
          },
          next_offset: null,
        });
      }
      if (allowedProblemIds.length <= 100) {
        historyQuery = historyQuery.in('problem_id', allowedProblemIds);
      } else {
        const { data, error } = await historyQuery;
        if (error) {
          return apiError('풀이 기록 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
        }
        const allowed = new Set(allowedProblemIds);
        const filteredRows = (data ?? []).filter((submission) => (
          allowed.has(submission.problem_id)
        ));
        return apiOk({
          submissions: filteredRows.slice(offset, offset + limit),
          summary: {
            total: statsResult.data?.length ?? 0,
            passed: (statsResult.data ?? []).filter((item) => item.status === 'pass').length,
            solved: new Set(
              (statsResult.data ?? [])
                .filter((item) => item.status === 'pass')
                .map((item) => item.problem_id),
            ).size,
          },
          curriculum: {
            subjects: subjectResult.data ?? [],
            stages: stageResult.data ?? [],
            chapters: chapterResult.data ?? [],
          },
          next_offset: offset + limit < filteredRows.length ? offset + limit : null,
        });
      }
    }
    historyQuery = historyQuery.range(offset, offset + limit - 1);
    const { data, error, count } = await historyQuery;
    if (error) {
      return apiError('풀이 기록 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
    }
    const total = count ?? 0;
    return apiOk({
      submissions: data ?? [],
      summary: {
        total: statsResult.data?.length ?? 0,
        passed: (statsResult.data ?? []).filter((item) => item.status === 'pass').length,
        solved: new Set(
          (statsResult.data ?? [])
            .filter((item) => item.status === 'pass')
            .map((item) => item.problem_id),
        ).size,
      },
      curriculum: {
        subjects: subjectResult.data ?? [],
        stages: stageResult.data ?? [],
        chapters: chapterResult.data ?? [],
      },
      next_offset: offset + limit < total ? offset + limit : null,
    });
  }

  if (user.role === 'teacher' && studentId) {
    const access = await canTeacherMonitorStudent(user.id, studentId);
    if (!access.allowed) {
      return apiError(
        access.reason === 'query_failed'
          ? '담당 학생 확인 중 오류가 발생했습니다.'
          : '권한이 없습니다.',
        access.reason === 'query_failed' ? 'INTERNAL_ERROR' : 'FORBIDDEN',
        access.reason === 'query_failed' ? 500 : 403,
      );
    }

    const isSummary = view === 'teacher-summary';
    const limit = Math.min(
      Math.max(Number.parseInt(searchParams.get('limit') ?? '20', 10) || 20, 1),
      50,
    );
    const offset = Math.max(
      Number.parseInt(searchParams.get('offset') ?? '0', 10) || 0,
      0,
    );
    let query = db
      .from('submissions')
      .select(`
        id, problem_id, ${isSummary ? '' : 'code,'} status, score, passed_count, total_count, runtime_ms, elapsed_sec, submitted_at,
        problems(
          problem_no, title, difficulty, order_no, chapter_id,
          chapters(
            id, title, order_no, stage_id,
            stages(
              id, title, order_no, subject_id,
              subjects(id, title, order_no)
            )
          )
        ),
        users(id, name, username)
      `, isSummary ? { count: 'exact' } : undefined)
      .eq('user_id', studentId)
      .in('status', ['pass', 'fail', 'partial'])
      .order('submitted_at', { ascending: false });

    if (problemId) query = query.eq('problem_id', problemId);
    if (isSummary) query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (isSummary) {
      let passedCountQuery = db
        .from('submissions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', studentId)
        .eq('status', 'pass');
      if (problemId) passedCountQuery = passedCountQuery.eq('problem_id', problemId);
      const { count: passedCount, error: passedCountError } = await passedCountQuery;
      if (passedCountError) {
        return apiError('제출 요약 조회 중 오류가 발생했습니다.', 'INTERNAL_ERROR', 500);
      }
      const total = count ?? 0;
      return apiOk({
        submissions: data ?? [],
        summary: {
          total,
          passed: passedCount ?? 0,
        },
        next_offset: offset + limit < total ? offset + limit : null,
      });
    }
    return apiOk({ submissions: data });
  }

  let query = db
    .from('submissions')
    .select(`
      id, problem_id, code, status, score, passed_count, total_count, runtime_ms, elapsed_sec, submitted_at,
      problems(
        problem_no, title, difficulty, order_no, chapter_id,
        chapters(
          id, title, order_no, stage_id,
          stages(
            id, title, order_no, subject_id,
            subjects(id, title, order_no)
          )
        )
      )
    `)
    .eq('user_id', user.id)
    .in('status', ['pass', 'fail', 'partial'])
    .order('submitted_at', { ascending: false });

  if (problemId) query = query.eq('problem_id', problemId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return apiOk({ submissions: data });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return apiError('인증이 필요합니다.', 'UNAUTHORIZED', 401);
  if (user.role !== 'student') {
    return apiError('학생 계정만 제출할 수 있습니다.', 'FORBIDDEN', 403);
  }

  const contentLength = Number.parseInt(req.headers.get('content-length') ?? '0', 10);
  if (Number.isFinite(contentLength) && contentLength > 128 * 1024) {
    return apiError('요청 본문이 너무 큽니다.', 'PAYLOAD_TOO_LARGE', 413);
  }
  const body = await req.json().catch(() => null);
  if (!body) return apiError('잘못된 요청입니다.', 'BAD_REQUEST', 400);

  try {
    const submission = await startSubmission(
      supabaseAdmin(),
      user.id,
      body,
      new URL(req.url).origin,
    );
    return apiOk({ submission }, 202);
  } catch (error) {
    if (error instanceof SubmissionValidationError) {
      return apiError(error.message, error.code, error.status);
    }
    console.error('Authoritative submission failed', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'unknown',
    });
    return apiError(
      '채점 서비스를 시작하지 못했습니다. 잠시 후 다시 시도해주세요.',
      'JUDGE_START_FAILED',
      503,
    );
  }
}
