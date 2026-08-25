export type SubmissionFallback = {
  /** Restarts the inactivity window until the one fallback has fired. */
  touch(): void;
  cancel(): void;
};

/**
 * Calls the recovery fetch at most once, after a full quiet interval.
 * Progress events call `touch`, so a healthy long-running stream does not
 * trigger a needless fetch just because grading takes more than 15 seconds.
 */
export function createSubmissionFallback(
  callback: () => void,
  delayMs: number,
): SubmissionFallback {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let used = false;

  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const touch = () => {
    if (used) return;
    cancel();
    timer = setTimeout(() => {
      timer = null;
      used = true;
      callback();
    }, delayMs);
  };

  return { touch, cancel };
}
