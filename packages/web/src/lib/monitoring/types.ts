import type { AppErrorCode } from '@cove/shared';

/**
 * What a command acknowledgement looks like on the wire.
 *
 * Mirrors the server's discriminated shape, and is tolerant of `undefined` for
 * the one case the schema cannot describe: an acknowledgement that never
 * arrived because the socket dropped mid-command.
 */
export type MonitoringAckResult<T> =
  | { ok: true; eventId: string; data: T }
  | { ok: false; eventId: string; code: AppErrorCode }
  | undefined;

/** Socket.IO adds an error-first argument when acknowledged retries are on. */
export function monitoringAck<T>(
  handler: (ack: MonitoringAckResult<T>) => void,
): (...args: unknown[]) => void {
  return (...args) => {
    const value = args.length > 1 ? args[1] : args[0];
    handler(value as MonitoringAckResult<T>);
  };
}
