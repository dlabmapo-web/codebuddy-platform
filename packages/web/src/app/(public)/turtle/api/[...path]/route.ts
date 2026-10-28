import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { trialAllowedPath, trialBody, trialBrowserBody, trialCookieName, trialNonceName, trialOriginAllowed } from '@/lib/turtle-trial/boundary';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' });
type Context = { params: Promise<{ path: string[] }> };
async function handler(request: Request, context: Context) {
  const { path: segments } = await context.params; const path = segments.join('/');
  if (!trialAllowedPath(path, request.method)) return NextResponse.json({ message: 'NOT_FOUND' }, { status: 404, headers });
  const secret = process.env.BFF_SHARED_SECRET;
  if (process.env.NEXT_PUBLIC_TURTLE_TRIAL_ENABLED !== 'true' || process.env.TURTLE_TRIAL_ENABLED === 'false' || !secret)
    return NextResponse.json({ message: 'TRIAL_UNAVAILABLE' }, { status: 503, headers });
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  if (request.method !== 'GET' && !trialOriginAllowed(request.headers, site))
    return NextResponse.json({ message: 'ACCESS_DENIED' }, { status: 403, headers });
  const production = process.env.NODE_ENV === 'production'; const jar = await cookies();
  const fixture = !production && process.env.COVE_TURTLE_BROWSER_E2E === '1';
  const guestCookie = trialCookieName(production, fixture), nonceCookie = trialNonceName(production, fixture);
  const token = jar.get(guestCookie)?.value ?? '';
  const nonce = jar.get(nonceCookie)?.value ?? '';
  // Opening the public page without a grant is an ordinary signed-out state.
  if (path === 'bootstrap' && !token) return new NextResponse(null, { status: 204, headers });
  try {
    const body = await trialBody(request);
    trialBrowserBody(path, body);
    // Caddy overwrites this header. The studio port stays on the private
    // network; public caller forwarding headers are never passed through.
    const ip = production ? request.headers.get('x-cove-client-ip') ?? 'unknown' : '127.0.0.1';
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/rpc';
    const upstreamHeaders = {
      'Content-Type': 'application/json', 'X-Cove-Bff-Secret': secret,
      'X-Cove-Turtle-Session': token, 'X-Cove-Turtle-Nonce': nonce, 'X-Cove-Client-IP': ip,
    };
    const upstream = await fetch(new URL('/api/turtle-trial/' + path, base), {
      method: path === 'challenge' ? 'POST' : request.method, headers: upstreamHeaders,
      body, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(55000),
    });
    if (path === 'project' && upstream.ok) return new NextResponse(await upstream.arrayBuffer(), {
      headers: { ...headers, 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="cove-turtle.zip"' },
    });
    const data = await upstream.json();
    if (!upstream.ok) {
      if (path === 'bootstrap' && upstream.status === 401) {
        const response = new NextResponse(null, { status: 204, headers });
        response.cookies.set(guestCookie, '', { ...cookieOptions(), maxAge: 0 });
        return response;
      }
      const retryAfter = Number(data.retryAfter ?? 0);
      return NextResponse.json({ message: typeof data.message === 'string' ? data.message : 'REQUEST_FAILED', ...(retryAfter > 0 ? { retryAfter } : {}) }, {
        status: upstream.status, headers: { ...headers, ...(retryAfter > 0 ? { 'Retry-After': String(retryAfter) } : {}) },
      });
    }
    if (path === 'challenge') {
      const response = NextResponse.json({ ready: true }, { headers });
      response.cookies.set(nonceCookie, data.nonce, { ...cookieOptions(), maxAge: 600 });
      return response;
    }
    if (path === 'access' && request.method === 'POST') {
      if (token) await fetch(new URL('/api/turtle-trial/access', base), {
        method: 'DELETE', headers: upstreamHeaders, signal: AbortSignal.timeout(5000),
      }).catch(() => {});
      const response = NextResponse.json({ expiresAt: data.expiresAt }, { headers });
      response.cookies.set(guestCookie, data.token, { ...cookieOptions(), maxAge: 7200 });
      return response;
    }
    const response = NextResponse.json(data, { headers });
    if (path === 'access' && request.method === 'DELETE') response.cookies.set(guestCookie, '', { ...cookieOptions(), maxAge: 0 });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return NextResponse.json({ message: message === 'SOURCE_TOO_LARGE' ? message : message === 'INVALID_REQUEST' || error instanceof SyntaxError ? 'INVALID_REQUEST' : 'TRIAL_UNAVAILABLE' }, {
      status: message === 'SOURCE_TOO_LARGE' ? 413 : message === 'INVALID_REQUEST' || error instanceof SyntaxError ? 400 : 503, headers,
    });
  }
}
export { handler as GET, handler as POST, handler as DELETE };
