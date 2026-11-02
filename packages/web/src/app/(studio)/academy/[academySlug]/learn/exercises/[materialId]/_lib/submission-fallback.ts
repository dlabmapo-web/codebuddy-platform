export type SubmissionFallback = {
  touch(): void;
  cancel(): void;
};

/** Read-only recovery after a quiet/dropped stream. Never repeats the submit action. */
export function createSubmissionFallback(callback: () => void, delayMs: number): SubmissionFallback {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let reads = 0;
  const clear = () => { if (timer) clearTimeout(timer); timer = null; };
  const schedule = (after: number) => {
    clear();
    if (stopped || reads >= 120) return;
    timer = setTimeout(() => {
      timer = null; reads++;
      callback();
      schedule(2_000);
    }, after);
  };
  return {
    touch: () => schedule(delayMs),
    cancel: () => { stopped = true; clear(); },
  };
}
