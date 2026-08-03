import type { NextRequest } from 'next/server';

import { publicConfig } from '@/lib/config';
import { createClient } from '@/lib/supabase/server';

/**
 * Proxies the grading stream from the API.
 *
 * `EventSource` cannot set an Authorization header, and the Supabase session
 * lives in a same-origin cookie, so the browser cannot reach the API directly.
 * This route reads the session server-side and forwards the bearer token.
 */
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> },
) {
  const { submissionId } = await params;
  const academyId = request.nextUrl.searchParams.get('academyId');
  if (!academyId) {
    return new Response('academyId is required', { status: 400 });
  }

  const { data } = await (await createClient()).auth.getSession();
  const token = data.session?.access_token;
  if (!token) return new Response('Unauthorized', { status: 401 });

  const upstream = await fetch(
    `${publicConfig.apiUrl.replace(/\/api\/rpc$/, '')}/api/submissions/${submissionId}/stream?academyId=${academyId}`,
    {
      headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
      // Aborting the upstream when the browser disconnects is what lets the
      // API clean up its queue listeners instead of leaking one per submission.
      signal: request.signal,
      cache: 'no-store',
    },
  );

  if (!upstream.ok || !upstream.body) {
    return new Response('Upstream unavailable', { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Without this, nginx buffers the stream and every event arrives at once
      // when it closes — which looks exactly like the feature not working.
      'X-Accel-Buffering': 'no',
    },
  });
}
