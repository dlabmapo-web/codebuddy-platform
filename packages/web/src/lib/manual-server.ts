import type { ManualWorkspace } from '@cove/shared';
import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';

import { publicConfig } from '@/lib/config';
import { createClient } from '@/lib/supabase/server';

/**
 * The manual workspace read the client would make after hydration, made during
 * the server render instead, so the page arrives with its activity and the
 * reads that depend on it start at once.
 *
 * The same endpoint, token and view-role header as `manualApi.read`. Any
 * failure returns null and the client reads exactly as before.
 */
export async function readManualWorkspace(target: {
  academyId: string;
  materialId: string;
  preview?: boolean;
  classId?: string;
}): Promise<{ workspace: ManualWorkspace; token: string } | null> {
  try {
    const { data } = await (await createClient()).auth.getSession();
    if (!data.session) return null;
    const base = (process.env.INTERNAL_API_RPC_URL?.trim() || publicConfig.apiUrl).replace(/\/rpc\/?$/, '/manual');
    const query = new URLSearchParams(
      Object.entries(target)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, String(value)]),
    );
    const viewRole = (await cookies()).get('cove_view_role')?.value;
    const response = await fetch(`${base}?${query}`, {
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        ...(viewRole ? { 'X-Cove-View-Role': viewRole } : {}),
      },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return { workspace: (await response.json()) as ManualWorkspace, token: randomUUID() };
  } catch {
    return null;
  }
}
