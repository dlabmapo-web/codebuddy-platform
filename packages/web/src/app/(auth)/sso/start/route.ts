import { validDlabAuthorizeUrl } from '@cove/shared';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { dlabEnabled, dlabCookieName, parseAttempt, newBinding, dlabPost, dlabFailure, dlabCookie, authResponse } from '@/lib/dlab-sso';

export async function GET(request: NextRequest) {
  try {
    if (!dlabEnabled()) return dlabFailure();
    const jar = await cookies();
    const previous = parseAttempt(jar.get(dlabCookieName())?.value);
    const binding = previous?.binding ?? newBinding();
    const returnTo = request.nextUrl.searchParams.getAll('return_to');
    const result = await dlabPost<unknown>('transactions', { binding, ...(previous ? { previousState: previous.state } : {}), ...(returnTo.length === 1 ? { returnTo: returnTo[0] } : {}) });
    const data = z.object({ state: z.string().regex(/^[a-f0-9]{64}$/), authorizeUrl: z.url() }).parse(result);
    if (!validDlabAuthorizeUrl(data.authorizeUrl)) return dlabFailure();
    const response = authResponse(data.authorizeUrl);
    response.cookies.set(dlabCookie(`${binding}.${data.state}`));
    return response;
  } catch { return dlabFailure(); }
}
