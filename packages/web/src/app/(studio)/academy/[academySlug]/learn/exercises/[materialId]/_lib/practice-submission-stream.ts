import { isTerminalStatus, submissionResultSchema, type SubmissionResult } from '@cove/shared';

export const PRACTICE_OBSERVATION_MS = 120_000;
export const PRACTICE_RECONNECT_LIMIT = 3;

/** One observation budget across EventSource's automatic reconnects; every recovery is read-only. */
export function observePracticeSubmission(options: {
  url: string;
  submissionId: string;
  acceptedAt: number;
  onResult: (result: SubmissionResult) => void;
  recover: () => Promise<unknown>;
}) {
  const remaining = Math.max(0, options.acceptedAt + PRACTICE_OBSERVATION_MS - Date.now());
  const source = remaining > 0 ? new EventSource(options.url) : null;
  let stopped = false;
  let disconnects = 0;
  const stop = (recover: boolean) => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    source?.close();
    if (recover) void options.recover().catch(() => undefined);
  };
  const timer = setTimeout(() => stop(true), remaining);
  source?.addEventListener('result', (event: MessageEvent<string>) => {
    if (stopped) return;
    try {
      const parsed = submissionResultSchema.safeParse(JSON.parse(event.data));
      if (!parsed.success || parsed.data.submissionId !== options.submissionId) return;
      options.onResult(parsed.data);
      if (isTerminalStatus(parsed.data.status)) stop(false);
    } catch { /* Bounded polling/final recovery handles malformed or dropped events. */ }
  });
  source?.addEventListener('error', () => {
    if (++disconnects >= PRACTICE_RECONNECT_LIMIT) stop(true);
  });
  return () => stop(false);
}
