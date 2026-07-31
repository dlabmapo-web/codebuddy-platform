import { saveDraftSchema } from '@cove/shared';
import { NextResponse, type NextRequest } from 'next/server';

import { createServerORPCClient } from '@/lib/orpc-server';

/**
 * Draft sync for a closing tab.
 *
 * `navigator.sendBeacon` cannot set an `Authorization` header, so it cannot
 * reach the Nest API directly. This same-origin route carries the session
 * cookie, and forwards through the server oRPC client like any other v2 read.
 *
 * The browser fires beacons after teardown and discards the response, so the
 * status code here is for logs, not for the client.
 */
export async function POST(request: NextRequest) {
  const parsed = saveDraftSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    await createServerORPCClient().learn.saveDraft(parsed.data);
    return NextResponse.json({ ok: true });
  } catch {
    // The code is still in the student's IndexedDB and syncs on next load.
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}
