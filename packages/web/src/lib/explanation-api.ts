import type { ExplanationRead, ExplanationReadResult, SaveExplanation } from '@cove/shared';
import { shouldForwardViewRole } from './orpc-view-role';
async function headers() {
  const { createClient } = await import('./supabase/client');
  const {
    data: { session },
  } = await createClient().auth.getSession();
  if (!session) throw new Error('AUTHENTICATION_REQUIRED');
  const result: Record<string, string> = {
    Authorization: `Bearer ${session.access_token}`,
  };
  const role = document.cookie.match(/(?:^|;\s*)cove_view_role=([^;]+)/)?.[1];
  if (role && shouldForwardViewRole())
    result['X-Cove-View-Role'] = decodeURIComponent(role);
  return result;
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { publicConfig } = await import('./config');
  const endpoint = publicConfig.apiUrl.replace(/\/rpc\/?$/, '/explanations');
  const response = await fetch(endpoint + path, {
    ...init,
    headers: { ...(await headers()), ...init?.headers },
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.code ?? 'CONTENT_VALIDATION_FAILED');
  return data as T;
}
export const explanationApi = {
  read: (input: ExplanationRead) => request<ExplanationReadResult>('?' + new URLSearchParams(Object.entries(input).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]))),
  save: (input: SaveExplanation) => request<{ materialId: string; revision: number }>('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }),
  mutate: (input: { academyId: string; courseId: string; lectureId: string; materialId: string; isVisible?: boolean }) => request(input.isVisible === undefined ? '' : '/visibility', { method: input.isVisible === undefined ? 'DELETE' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }),
};
