// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { pdfApi } from './pdf-api';

vi.mock('./config', () => ({ publicConfig: { apiUrl: 'http://localhost:4000/api/rpc' } }));
vi.mock('./orpc-view-role', () => ({ shouldForwardViewRole: () => false }));
vi.mock('./supabase/client', () => ({ createClient: () => ({ auth: {
  getSession: async () => ({ data: { session: { access_token: 'test-session' } } }),
} }) }));
afterEach(() => vi.unstubAllGlobals());

it('omits optional undefined context so standalone PDF reads remain valid', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({}));
  vi.stubGlobal('fetch', fetcher);
  await pdfApi.read({ academyId: 'academy', materialId: 'pdf', preview: false, exerciseMaterialId: undefined });
  const url = new URL(String(fetcher.mock.calls[0]![0]));
  expect(url.searchParams.has('exerciseMaterialId')).toBe(false);
  expect(url.searchParams.get('preview')).toBe('false');
});

it('sends the exercise identity when requesting an embedded PDF', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({}));
  vi.stubGlobal('fetch', fetcher);
  await pdfApi.read({ academyId: 'academy', materialId: 'pdf', exerciseMaterialId: 'practice' });
  const url = new URL(String(fetcher.mock.calls[0]![0]));
  expect(url.searchParams.get('exerciseMaterialId')).toBe('practice');
  expect(fetcher.mock.calls[0]![1]).toMatchObject({ cache: 'no-store', headers: { Authorization: 'Bearer test-session' } });
});
