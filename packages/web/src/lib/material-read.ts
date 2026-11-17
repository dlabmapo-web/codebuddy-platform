import { ApiError, extractAppErrorCode, isExplicitAccessDeniedError, toApiError } from './api-errors';

/** An unavailable activity is not evidence that its academy disappeared. */
export function isMaterialUnavailable(error: unknown): boolean {
  const { code, status } = toApiError(error);
  return isExplicitAccessDeniedError(error) || code === 'EXERCISE_NOT_AVAILABLE' ||
    code === 'PDF_NOT_AVAILABLE' || status === 401 || status === 403;
}

/** Retain HTTP status and known application codes, including non-JSON gateways. */
export async function readMaterialResponse<T>(response: Response): Promise<T> {
  let body: unknown;
  try { body = await response.json(); }
  catch {
    throw new ApiError('Material response could not be read', response.ok ? 502 : response.status);
  }
  if (!response.ok) {
    const code = extractAppErrorCode(undefined, body);
    throw new ApiError('Material request failed', response.status, [], code);
  }
  return body as T;
}

export type MaterialRead<T> = { ok: true; data: T } | { ok: false; error: unknown };

/** Attach both handlers immediately: a redirected Turtle branch may not await it. */
export function settleMaterialRead<T>(request: Promise<T>): Promise<MaterialRead<T>> {
  return request.then(data => ({ ok: true, data }), error => ({ ok: false, error }));
}
