import { notFound } from 'next/navigation';

import { createPlatformServerORPCClient } from '@/lib/orpc-server';

/**
 * The library's academy id, for the editors mounted over a library course.
 *
 * Those editors are the academy editors — the same components a Team Lead
 * uses — and they are addressed by academy. The library's routes deliberately
 * carry no academy slug, so the id is resolved here rather than read out of
 * the URL, and head office never sees its own curriculum addressed as though
 * it were a customer's academy.
 *
 * A 404 when the platform has no library yet, which is the honest answer:
 * no library means no course at this address, and creating one as a side
 * effect of following a link would put a row in the database for anybody who
 * guessed a URL.
 */
export async function requireLibraryAcademyId(): Promise<string> {
  let academyId: string | null = null;
  try {
    ({ academyId } = await createPlatformServerORPCClient().platformLibrary.academy(
      {},
    ));
  } catch (error) {
    // A refusal and an unreachable API are not "no library exists", and
    // answering both with a 404 hides which one happened.
    console.error('[library] could not resolve the library academy', { error });
    throw error;
  }
  if (!academyId) {
    // No library has ever been created. A real state on a fresh platform, and
    // the only one of the three that is genuinely "not found".
    console.error('[library] no LIBRARY academy exists yet');
    notFound();
  }
  return academyId;
}
