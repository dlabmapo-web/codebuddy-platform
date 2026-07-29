export const SUBMISSION_RECONCILIATION_DELAY_MS = 3_000;

export function shouldReconcileSubmission({
  elapsedMs,
  attempted,
}: {
  elapsedMs: number;
  attempted: boolean;
}) {
  return !attempted && elapsedMs >= SUBMISSION_RECONCILIATION_DELAY_MS;
}
