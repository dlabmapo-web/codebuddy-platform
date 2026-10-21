import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { safeDlabReturnTo } from '@cove/shared';
import { dlabEnabled, dlabCookieName, parseAttempt, dlabPost, dlabFailure, dlabCookie, authResponse, clearDlabContext } from '@/lib/dlab-sso';
import { createClient } from '@/lib/supabase/server';
import { createServerORPCClient } from '@/lib/orpc-server';

export async function GET(request: NextRequest) {
  let issuedSession = false;
  const supabase = await createClient();
  try {
    if (!dlabEnabled()) return dlabFailure();
    const attempt = parseAttempt((await cookies()).get(dlabCookieName())?.value);
    const params = request.nextUrl.searchParams;
    if (!attempt || params.getAll('state').length !== 1 || params.get('state') !== attempt.state || params.getAll('code').length > 1 || params.getAll('error').length > 1) return dlabFailure();
    const bridge = z.object({ tokenHash: z.string().min(1).max(2048), authUserId: z.uuid(), ticket: z.string().regex(/^[a-f0-9]{64}$/) }).parse(await dlabPost<unknown>('complete', { binding: attempt.binding, state: attempt.state, ...(params.has('code') ? { code: params.get('code') } : {}), ...(params.has('error') ? { error: params.get('error') } : {}) }));
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: bridge.tokenHash, type: 'email' });
    issuedSession = Boolean(data.session);
    if (error || !data.session || data.session.user.id !== bridge.authUserId) throw new Error('Invalid session');
    const activated = z.object({ destination: z.string(), requiresStudentSession: z.boolean() }).parse(await dlabPost<unknown>('activate', { binding: attempt.binding, ticket: bridge.ticket }, data.session.access_token));
    const destination = safeDlabReturnTo(activated.destination);
    if (!destination) throw new Error('Invalid destination');
    const client = createServerORPCClient(data.session.access_token);
    if (activated.requiresStudentSession) await client.studentSession.begin({});
    const account = await client.auth.me({});
    const target = account.user.memberships.find(m => {
      const root = `/academy/${m.academy.slug}`;
      return m.status === 'ACTIVE' && (destination === root || destination.startsWith(root + '/'));
    });
    if (!target || account.user.authUserId !== bridge.authUserId || (target.role === 'STUDENT') !== activated.requiresStudentSession) throw new Error('Invalid academy session');
    await clearDlabContext();
    const response = authResponse(destination);
    response.cookies.set({ ...dlabCookie(''), maxAge: 0 });
    return response;
  } catch {
    if (issuedSession) await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    return dlabFailure();
  }
}
