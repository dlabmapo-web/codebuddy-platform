import type {
  DbCollaborationSession,
  DbProblem,
  DbProblemHint,
  DbSubmission,
  DbTestCase,
} from '@/lib/types/db';
import type { ProblemNavigation } from '@/lib/problems/navigation';

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
  starterCode: string;
  code: string;
  lastSavedCode: string | null;
  sessionId: string;
  attemptCount: number;
};

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
  const [detail, submissionList, historicalSubmission] = await Promise.all([
    requestJson<ProblemDetailResponse>(
      fetcher,
      `/api/problems/${problemId}`,
      requestInit,
    ),
    requestJson<SubmissionListResponse>(
      fetcher,
      `/api/submissions?problem_id=${problemId}`,
      requestInit,
    ),
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
    starterCode,
    code: historicalCode ?? savedDraft ?? starterCode,
    lastSavedCode: savedDraft,
    sessionId: session.id,
    attemptCount: submissionList.submissions?.length ?? 0,
  };
}
