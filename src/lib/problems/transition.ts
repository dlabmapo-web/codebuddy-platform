import type {
  DbCollaborationSession,
  DbProblem,
  DbProblemHint,
  DbSubmission,
  DbTestCase,
} from '@/lib/types/db';
import type { ProblemNavigation } from '@/lib/problems/navigation';
import type { LearningContext } from '@/lib/curriculum/learningContext';

type Fetcher = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

type ProblemDetailResponse = {
  problem?: DbProblem;
  test_cases?: Pick<
    DbTestCase,
    'id' | 'input' | 'expected_output' | 'is_sample' | 'order_no'
  >[];
  hints?: Pick<DbProblemHint, 'id' | 'hint_text' | 'order_no'>[];
  navigation?: ProblemNavigation | null;
  learning_context?: LearningContext | null;
};

type SubmissionCountResponse = {
  count?: number;
};

type SubmissionListResponse = {
  submissions?: DbSubmission[];
};

type SubmissionDetailResponse = {
  submission?: DbSubmission;
};

type SessionResponse = {
  session?: DbCollaborationSession;
};

export type ProblemTransitionSnapshot = {
  problem: DbProblem & {
    test_cases: NonNullable<ProblemDetailResponse['test_cases']>;
    hints: NonNullable<ProblemDetailResponse['hints']>;
  };
  navigation: ProblemNavigation | null;
  learningContext: LearningContext | null;
  starterCode: string;
  code: string;
  lastSavedCode: string | null;
  sessionId: string;
  attemptCount: number;
};

export async function loadProblemLearningContext({
  problemId,
  signal,
  fetcher = fetch,
}: {
  problemId: string;
  signal: AbortSignal;
  fetcher?: Fetcher;
}): Promise<LearningContext | null> {
  const response = await requestJson<Pick<ProblemDetailResponse, 'learning_context'>>(
    fetcher,
    `/api/problems/${problemId}/learning-context`,
    { signal, cache: 'no-store' },
  );
  return response.learning_context ?? null;
}

async function requestJson<T>(
  fetcher: Fetcher,
  input: string,
  init: RequestInit,
): Promise<T> {
  const response = await fetcher(input, init);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function shouldTryLegacy(error: unknown, signal: AbortSignal) {
  return !signal.aborted
    && !(error instanceof DOMException && error.name === 'AbortError');
}

async function requestTransitionDetail(
  fetcher: Fetcher,
  problemId: string,
  signal: AbortSignal,
) {
  try {
    return await requestJson<ProblemDetailResponse>(
      fetcher,
      `/api/problems/${problemId}?view=transition`,
      { signal },
    );
  } catch (error) {
    if (!shouldTryLegacy(error, signal)) throw error;
    return requestJson<ProblemDetailResponse>(
      fetcher,
      `/api/problems/${problemId}`,
      { signal },
    );
  }
}

async function requestSubmissionCount(
  fetcher: Fetcher,
  problemId: string,
  signal: AbortSignal,
) {
  try {
    const response = await requestJson<SubmissionCountResponse>(
      fetcher,
      `/api/submissions?problem_id=${problemId}&view=count`,
      { signal },
    );
    return response.count ?? 0;
  } catch (error) {
    if (!shouldTryLegacy(error, signal)) throw error;
    const legacy = await requestJson<SubmissionListResponse>(
      fetcher,
      `/api/submissions?problem_id=${problemId}`,
      { signal },
    );
    return legacy.submissions?.length ?? 0;
  }
}

export async function loadProblemTransitionSnapshot({
  problemId,
  submissionId,
  previousSessionId,
  previousCode,
  signal,
  fetcher = fetch,
}: {
  problemId: string;
  submissionId?: string;
  previousSessionId?: string | null;
  previousCode?: string;
  signal: AbortSignal;
  fetcher?: Fetcher;
}): Promise<ProblemTransitionSnapshot> {
  const requestInit = { signal };
  const [detail, attemptCount, historicalSubmission] = await Promise.all([
    requestTransitionDetail(fetcher, problemId, signal),
    requestSubmissionCount(fetcher, problemId, signal),
    submissionId
      ? requestJson<SubmissionDetailResponse>(
          fetcher,
          `/api/submissions/${submissionId}`,
          requestInit,
        )
      : Promise.resolve<SubmissionDetailResponse>({}),
  ]);

  if (!detail.problem) {
    throw new Error('Problem detail is missing');
  }

  const sessionResponse = await requestJson<SessionResponse>(
    fetcher,
    '/api/sessions',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        problem_id: problemId,
        previous_session_id: previousSessionId ?? undefined,
        previous_final_code: previousSessionId ? previousCode ?? '' : undefined,
      }),
      signal,
    },
  );
  const session = sessionResponse.session;
  if (!session?.id) {
    throw new Error('Problem session is missing');
  }

  const starterCode = detail.problem.starter_code ?? '';
  const savedDraft = typeof session.final_code === 'string'
    ? session.final_code
    : null;
  const requestedSubmission = historicalSubmission.submission;
  const historicalCode = requestedSubmission?.problem_id === problemId
    && typeof requestedSubmission.code === 'string'
    ? requestedSubmission.code
    : null;

  return {
    problem: {
      ...detail.problem,
      test_cases: detail.test_cases ?? [],
      hints: detail.hints ?? [],
    },
    navigation: detail.navigation ?? null,
    learningContext: detail.learning_context ?? null,
    starterCode,
    code: historicalCode ?? savedDraft ?? starterCode,
    lastSavedCode: savedDraft,
    sessionId: session.id,
    attemptCount,
  };
}
