import { cache } from 'react';
import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import type { ExplanationDocument, ExplanationReadResult, ExplanationAuthorContext } from '@cove/shared';
import { publicConfig } from './config';
import { createClient } from './supabase/server';
async function request<T>(path: string, query: URLSearchParams, forwardViewRole: boolean): Promise<T | null> {
  try {
    const { data: { session } } = await (await createClient()).auth.getSession();
    if (!session) return null;
    const base = (process.env.INTERNAL_API_RPC_URL?.trim() || publicConfig.apiUrl).replace(/\/rpc\/?$/, '/explanations');
    const role = forwardViewRole ? (await cookies()).get('cove_view_role')?.value : undefined;
    const response = await fetch(`${base}${path}?${query}`, { cache: 'no-store', headers: { Authorization: `Bearer ${session.access_token}`, ...(role ? { 'X-Cove-View-Role': role } : {}) } });
    return response.ok ? await response.json() as T : null;
  } catch { return null; }
}
/** Main content, navigation and images arrive with the server render. */
export const readExplanation = cache(async (academyId: string, materialId: string, classId?: string, preview = false, forwardViewRole = true) => {
  const query = new URLSearchParams({ academyId, materialId, ...(classId ? { classId } : {}), ...(preview ? { preview: 'true' } : {}) });
  const data = await request<ExplanationReadResult>('', query, forwardViewRole);
  return data ? { data, token: randomUUID() } : null;
});
export const readExplanationAuthorContext = cache((academyId: string, courseId: string, lectureId: string, forwardViewRole = true) =>
  request<ExplanationAuthorContext>('/context', new URLSearchParams({ academyId, courseId, lectureId }), forwardViewRole));

/** Smaller authoring projection: no student outline or progress queries. */
export const readExplanationAuthorDocument = cache((academyId: string, materialId: string, forwardViewRole = true) =>
  request<ExplanationDocument>('/document', new URLSearchParams({ academyId, materialId }), forwardViewRole));
