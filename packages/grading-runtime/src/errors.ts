export type ErrorCode =
  | "BUSY"
  | "UNSUPPORTED"
  | "IDENTITY_MISMATCH"
  | "STALE_GENERATION"
  | "UNCERTAIN"
  | "NOT_FOUND"
  | "INFRASTRUCTURE";
export class BrokerError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}
export function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new BrokerError("INFRASTRUCTURE", message);
}
