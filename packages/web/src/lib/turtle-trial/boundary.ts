import { turtleBodyBytes } from '@cove/shared';

export const trialCookieName = (production: boolean) => production ? '__Host-cove-turtle' : 'cove-turtle-dev';
export const trialNonceName = (production: boolean) => production ? '__Host-cove-turtle-nonce' : 'cove-turtle-nonce-dev';
export function trialAllowedPath(path: string, method: string): boolean {
  return (path === 'challenge' && method === 'GET') ||
    (path === 'access' && ['POST', 'DELETE'].includes(method)) ||
    (path === 'bootstrap' && method === 'GET') ||
    (['runs', 'project'].includes(path) && method === 'POST') ||
    (/^runs\/[a-f0-9-]{36}$/.test(path) && ['GET', 'DELETE'].includes(method)) ||
    (/^runs\/[a-f0-9-]{36}\/input$/.test(path) && method === 'POST');
}
export function trialOriginAllowed(headers: Headers, site: string): boolean {
  return headers.get('origin') === new URL(site).origin &&
    headers.get('x-cove-turtle') === '1' &&
    (!headers.has('sec-fetch-site') || headers.get('sec-fetch-site') === 'same-origin');
}
export async function trialBody(request: Request): Promise<string | undefined> {
  if (!['POST', 'PUT', 'PATCH'].includes(request.method)) return undefined;
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') throw new Error('INVALID_REQUEST');
  if (Number(request.headers.get('content-length') ?? 0) > turtleBodyBytes) throw new Error('SOURCE_TOO_LARGE');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('INVALID_REQUEST');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > turtleBodyBytes) { await reader.cancel(); throw new Error('SOURCE_TOO_LARGE'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  JSON.parse(text); return text;
}
