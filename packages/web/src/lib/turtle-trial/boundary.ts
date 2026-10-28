import { turtleBodyBytes, turtleBrowserStartSchema } from '@cove/shared';

export const trialCookieName = (production: boolean, fixture = false) => production ? '__Host-cove-turtle' : fixture ? 'cove-turtle-browser-fixture' : 'cove-turtle-dev';
export const trialNonceName = (production: boolean, fixture = false) => production ? '__Host-cove-turtle-nonce' : fixture ? 'cove-turtle-browser-fixture-nonce' : 'cove-turtle-nonce-dev';
export function trialAllowedPath(path: string, method: string): boolean {
  return (path === 'challenge' && method === 'GET') ||
    (path === 'access' && ['POST', 'DELETE'].includes(method)) ||
    (path === 'bootstrap' && method === 'GET') ||
    (['runs', 'project', 'browser-runs'].includes(path) && method === 'POST') ||
    (/^browser-runs\/request\/[a-f0-9-]{36}$/.test(path) && method === 'GET') ||
    (/^browser-runs\/[a-f0-9-]{36}$/.test(path) && method === 'DELETE') ||
    (/^browser-runs\/[a-f0-9-]{36}\/renew$/.test(path) && method === 'POST') ||
    (/^runs\/[a-f0-9-]{36}$/.test(path) && ['GET', 'DELETE'].includes(method)) ||
    (/^runs\/[a-f0-9-]{36}\/input$/.test(path) && method === 'POST');
}
export function trialOriginAllowed(headers: Headers, site: string): boolean {
  return headers.get('origin') === new URL(site).origin &&
    headers.get('x-cove-turtle') === '1' &&
    (!headers.has('sec-fetch-site') || headers.get('sec-fetch-site') === 'same-origin');
}
export function trialBrowserBody(path: string, body?: string) {
  if (!path.startsWith('browser-runs') || body === undefined) return;
  const value = JSON.parse(body);
  if (path === 'browser-runs' ? !turtleBrowserStartSchema.safeParse(value).success : !value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 0) throw new Error('INVALID_REQUEST');
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
