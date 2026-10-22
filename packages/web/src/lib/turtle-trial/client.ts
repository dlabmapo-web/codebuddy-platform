export class TurtleRequestError extends Error {
  constructor(message: string, public status: number, public retryAfter = 0) { super(message); }
}
export async function turtleRequest<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const response = await fetch('/turtle/api/' + path, {
    method, credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-Cove-Turtle': '1' },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  if (response.status === 204) return null as T;
  const body = await response.json();
  if (!response.ok) throw new TurtleRequestError(body.message ?? 'REQUEST_FAILED', response.status, Number(body.retryAfter ?? 0));
  return body as T;
}
