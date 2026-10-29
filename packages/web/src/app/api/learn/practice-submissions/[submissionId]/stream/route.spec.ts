import { NextRequest } from 'next/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GET } from './route';
const session = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getSession: session } }),
}));
vi.mock('@/lib/config', () => ({
  publicConfig: { apiUrl: 'https://api.example/api/rpc' },
}));
const fetchMock = vi.fn();
beforeEach(() => {
  session.mockResolvedValue({
    data: { session: { access_token: 'private-token' } },
  });
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
it('forwards the cookie session bearer and browser abort signal to the separate practice stream', async () => {
  const request = new NextRequest(
    'https://web.example/api/learn/practice-submissions/attempt/stream?academyId=academy',
  );
  fetchMock.mockResolvedValue(new Response('event: result\ndata: {}\n\n'));
  const response = await GET(request, {
    params: Promise.resolve({ submissionId: 'attempt' }),
  });
  expect(fetchMock).toHaveBeenCalledWith(
    'https://api.example/api/practice-submissions/attempt/stream?academyId=academy',
    {
      headers: {
        Authorization: 'Bearer private-token',
        Accept: 'text/event-stream',
      },
      signal: request.signal,
      cache: 'no-store',
    },
  );
  expect(response.headers.get('Content-Type')).toBe('text/event-stream');
  expect(response.headers.get('X-Accel-Buffering')).toBe('no');
  expect(await response.text()).not.toContain('private-token');
});
it('rejects unauthenticated requests and missing scope without opening upstream', async () => {
  const params = { params: Promise.resolve({ submissionId: 'attempt' }) };
  expect(
    (await GET(new NextRequest('https://web.example/stream'), params)).status,
  ).toBe(400);
  session.mockResolvedValue({ data: { session: null } });
  expect(
    (
      await GET(
        new NextRequest('https://web.example/stream?academyId=academy'),
        params,
      )
    ).status,
  ).toBe(401);
  expect(fetchMock).not.toHaveBeenCalled();
});
it('returns no upstream error body or private diagnostics on refusal', async () => {
  fetchMock.mockResolvedValue(new Response('SECRET', { status: 403 }));
  const response = await GET(
    new NextRequest('https://web.example/stream?academyId=academy'),
    { params: Promise.resolve({ submissionId: 'attempt' }) },
  );
  expect(response.status).toBe(502);
  expect(await response.text()).not.toContain('SECRET');
});
