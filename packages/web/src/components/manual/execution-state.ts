const keys = {
  QUEUED: 'execution.queued', STARTING: 'execution.starting', RUNNING: 'execution.running',
  WAITING_INPUT: 'execution.waiting_input', DISPLAYING: 'execution.displaying',
  FINISHED: 'execution.finished', ERROR: 'execution.error', STOPPED: 'execution.stopped',
  TIMED_OUT: 'execution.timed_out', OUTPUT_LIMIT: 'execution.output_limit',
  DISCONNECTED: 'execution.disconnected', QUEUE_EXPIRED: 'execution.queue_expired',
} as const;
export function executionTranslationKey(state: string): typeof keys[keyof typeof keys] {
  return keys[state as keyof typeof keys] ?? 'execution.error';
}
