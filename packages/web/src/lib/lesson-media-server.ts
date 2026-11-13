import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import type { PdfReadResult, VideoReadResult } from '@cove/shared';
import { publicConfig } from './config';
import { createClient } from './supabase/server';

/** Seed the existing media query during the server render. */
export async function readLessonMedia<T extends 'documents' | 'videos'>(kind: T, academyId: string, materialId: string): Promise<{
  data: T extends 'documents' ? PdfReadResult : VideoReadResult; token: string;
} | null> {
  try {
    const { data: { session } } = await (await createClient()).auth.getSession();
    if (!session) return null;
    const base = (process.env.INTERNAL_API_RPC_URL?.trim() || publicConfig.apiUrl).replace(/\/rpc\/?$/, `/${kind}`);
    const role = (await cookies()).get('cove_view_role')?.value;
    const response = await fetch(`${base}?${new URLSearchParams({ academyId, materialId })}`, {
      cache: 'no-store', headers: { Authorization: `Bearer ${session.access_token}`, ...(role ? { 'X-Cove-View-Role': role } : {}) },
    });
    return response.ok ? { data: await response.json(), token: randomUUID() } : null;
  } catch { return null; }
}
