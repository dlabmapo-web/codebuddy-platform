import { describe, expect, it, vi } from 'vitest';
import { loadProblemTransitionSnapshot } from './transition';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function problem(id: string, starterCode = 'print("starter")') {
  return {
    id,
    problem_no: 1,
    chapter_id: 'chapter-1',
    order_no: 1,
    title: 'Problem',
    description: 'Description',
    difficulty: 'easy',
    input_format: null,
    output_format: null,
    constraint_text: null,
    starter_code: starterCode,
    time_limit_ms: 3000,
    memory_limit_mb: 128,
    is_published: true,
    use_ai_feedback: false,
    created_by: null,
    created_at: '2026-07-28T00:00:00.000Z',
    updated_at: '2026-07-28T00:00:00.000Z',
  };
}

function session(problemId: string, finalCode: string | null) {
  return {
    id: `session-${problemId}`,
    problem_id: problemId,
    student_id: 'student-1',
    teacher_id: null,
    status: 'active',
    final_code: finalCode,
    started_at: '2026-07-28T00:00:00.000Z',
    ended_at: null,
    created_at: '2026-07-28T00:00:00.000Z',
  };
}

function createFetcher({
  problemId = 'problem-2',
  savedDraft = 'print("draft")',
  historicalProblemId = problemId,
}: {
  problemId?: string;
  savedDraft?: string | null;
  historicalProblemId?: string;
} = {}) {
  return vi.fn(async (input: string, init?: RequestInit) => {
    void init;
    if (input === `/api/problems/${problemId}`) {
      return jsonResponse({
        problem: problem(problemId),
        test_cases: [],
        hints: [],
        navigation: null,
      });
    }
    if (input === `/api/submissions?problem_id=${problemId}`) {
      return jsonResponse({ submissions: [{ id: 'attempt-1' }] });
    }
    if (input === '/api/submissions/submission-1') {
      return jsonResponse({
        submission: {
          problem_id: historicalProblemId,
          code: 'print("historical")',
        },
      });
    }
    if (input === '/api/sessions') {
      return jsonResponse({ session: session(problemId, savedDraft) }, 201);
    }
    return jsonResponse({}, 404);
  });
}

describe('loadProblemTransitionSnapshot', () => {
  it('uses a saved draft before starter code', async () => {
    const fetcher = createFetcher();
    const snapshot = await loadProblemTransitionSnapshot({
      problemId: 'problem-2',
      signal: new AbortController().signal,
      fetcher,
    });

    expect(snapshot.code).toBe('print("draft")');
    expect(snapshot.lastSavedCode).toBe('print("draft")');
    expect(snapshot.attemptCount).toBe(1);
  });

  it('preserves an intentionally empty saved draft', async () => {
    const fetcher = createFetcher({ savedDraft: '' });
    const snapshot = await loadProblemTransitionSnapshot({
      problemId: 'problem-2',
      signal: new AbortController().signal,
      fetcher,
    });

    expect(snapshot.code).toBe('');
    expect(snapshot.lastSavedCode).toBe('');
  });

  it('uses a matching historical submission before the saved draft', async () => {
    const fetcher = createFetcher();
    const snapshot = await loadProblemTransitionSnapshot({
      problemId: 'problem-2',
      submissionId: 'submission-1',
      signal: new AbortController().signal,
      fetcher,
    });

    expect(snapshot.code).toBe('print("historical")');
  });

  it('does not leak historical code from another problem', async () => {
    const fetcher = createFetcher({ historicalProblemId: 'problem-1' });
    const snapshot = await loadProblemTransitionSnapshot({
      problemId: 'problem-2',
      submissionId: 'submission-1',
      signal: new AbortController().signal,
      fetcher,
    });

    expect(snapshot.code).toBe('print("draft")');
  });

  it('does not create a destination session when problem loading fails', async () => {
    const fetcher = vi.fn(async (input: string) => {
      if (input.startsWith('/api/problems/')) return jsonResponse({}, 404);
      return jsonResponse({ submissions: [] });
    });

    await expect(loadProblemTransitionSnapshot({
      problemId: 'missing-problem',
      signal: new AbortController().signal,
      fetcher,
    })).rejects.toThrow('Request failed: 404');

    expect(fetcher).not.toHaveBeenCalledWith(
      '/api/sessions',
      expect.anything(),
    );
  });

  it('passes the same cancellation signal to every request', async () => {
    const controller = new AbortController();
    const fetcher = createFetcher();

    await loadProblemTransitionSnapshot({
      problemId: 'problem-2',
      signal: controller.signal,
      fetcher,
    });

    for (const [, init] of fetcher.mock.calls) {
      expect(init?.signal).toBe(controller.signal);
    }
  });

  it('cancels an in-flight snapshot before session creation', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn((_input: string, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      })
    ));

    const snapshot = loadProblemTransitionSnapshot({
      problemId: 'problem-2',
      signal: controller.signal,
      fetcher,
    });
    controller.abort();

    await expect(snapshot).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).not.toHaveBeenCalledWith(
      '/api/sessions',
      expect.anything(),
    );
  });

  it('hands the previous draft to session creation before the atomic swap', async () => {
    const fetcher = createFetcher();

    await loadProblemTransitionSnapshot({
      problemId: 'problem-2',
      previousSessionId: 'session-problem-1',
      previousCode: 'print("leaving problem 1")',
      signal: new AbortController().signal,
      fetcher,
    });

    const sessionCall = fetcher.mock.calls.find(([input]) => input === '/api/sessions');
    expect(JSON.parse(String(sessionCall?.[1]?.body))).toEqual({
      problem_id: 'problem-2',
      previous_session_id: 'session-problem-1',
      previous_final_code: 'print("leaving problem 1")',
    });
  });
});
