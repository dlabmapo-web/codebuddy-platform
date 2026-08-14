/**
 * The one hook the forced-logout path has into unsaved work.
 *
 * §9.3 requires a draft flush before an automatic sign-out, and the component
 * that owns the draft is several routes away from the component that owns the
 * timer. A registry rather than a DOM event because the guard has to *await*
 * the result — it must be able to tell the student their work could not be
 * confirmed, and a dispatched event returns nothing to wait on.
 *
 * It never submits. Saving a draft is preserving what the student wrote;
 * submitting it would grade work they had not finished, on a clock they did not
 * choose.
 */

type Flush = () => Promise<unknown>;

const flushes = new Set<Flush>();

/**
 * Registers a draft flush for as long as its editor is mounted.
 *
 * Returns the unregister function, so the caller's effect cleanup is the whole
 * lifecycle — an editor that unmounted cannot be asked to save.
 */
export function registerDraftFlush(flush: Flush): () => void {
  flushes.add(flush);
  return () => {
    flushes.delete(flush);
  };
}

/**
 * Runs every registered flush, and says whether they all succeeded.
 *
 * `allSettled` rather than `all`: one editor failing to reach the server must
 * not stop another from saving, and the student is told about the failure
 * rather than the logout being cancelled — §9.3 keeps the security deadline
 * whatever happens to the draft.
 */
export async function flushDrafts(): Promise<boolean> {
  if (flushes.size === 0) return true;
  const results = await Promise.allSettled([...flushes].map((flush) => flush()));
  return results.every((result) => result.status === 'fulfilled');
}
