// Only read queries use this policy. Uploads and progress mutations must not
// be replayed as a side effect of recovering a lesson read.
export function retryVideoRead(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === 'number')
    return status === 429 || (status >= 500 && status <= 599);
  // fetch rejects with TypeError for network errors. A non-JSON gateway
  // response can fail JSON parsing before the HTTP status is attached.
  return error instanceof TypeError || error instanceof SyntaxError;
}

export const videoReadRetryDelay = (attempt: number) =>
  Math.min(500 * 2 ** attempt, 2000);
