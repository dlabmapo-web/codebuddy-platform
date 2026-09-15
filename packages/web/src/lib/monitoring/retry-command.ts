import type { MonitoringAckResult } from './types';

/** Command-local retries: never apply global retries to unacknowledged awareness. */
export function retryMonitoringCommand<T>({
  send,
  onResult,
  onRetry,
}: {
  send: (ack: (result: MonitoringAckResult<T>) => void) => void;
  onResult: (result: MonitoringAckResult<T>) => void;
  onRetry: () => void;
}): () => void {
  let cancelled = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = () => {
    if (cancelled) return;
    const current = ++attempt;
    let settled = false;
    const finish = (ack: MonitoringAckResult<T>) => {
      if (cancelled || settled || current !== attempt) return;
      settled = true;
      clearTimeout(timer);
      const transient = !ack || (!ack.ok && ack.code === 'MONITORING_REALTIME_UNAVAILABLE');
      if (transient && attempt < 4) {
        onRetry();
        timer = setTimeout(run, 1_000 * 2 ** (attempt - 1));
      } else {
        onResult(ack);
      }
    };
    timer = setTimeout(() => finish(undefined), 8_000);
    send(finish);
  };
  run();
  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}
