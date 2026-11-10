import { cache } from 'react';
import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import type { ExplanationReadResult } from '@cove/shared';
import { publicConfig } from './config';
import { createClient } from './supabase/server';

/** One request-scoped server read, including navigation and private images. */
export const readExplanation = cache(async (academyId: string, materialId: string, classId?: string, preview = false): Promise<{ data: ExplanationReadResult; token: string } | null> => {
  try {
    const { data: { session } } = await (await createClient()).auth.getSession();
    if (!session) return null;
    const base = (process.env.INTERNAL_API_RPC_URL?.trim() || publicConfig.apiUrl).replace(/\/rpc\/?$/, '/explanations');
    const role = (await cookies()).get('cove_view_role')?.value;
    const query = new URLSearchParams({ academyId, materialId, ...(classId ? { classId } : {}), ...(preview ? { preview: 'true' } : {}) });
    const response = await fetch(`${base}?${query}`, { cache: 'no-store', headers: { Authorization: `Bearer ${session.access_token}`, ...(role ? { 'X-Cove-View-Role': role } : {}) } });
    if (!response.ok) return null;
    return { data: await response.json() as ExplanationReadResult, token: randomUUID() };
  } catch { return null; }
});
