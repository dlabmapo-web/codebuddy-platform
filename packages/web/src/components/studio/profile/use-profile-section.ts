'use client';

import { useCallback, useState } from 'react';

import { toApiError } from '@/lib/api-errors';

/**
 * One independently saved section of a profile form.
 *
 * Every section on My Page owns its own draft, its own revision, and its own
 * save button, because they have different owners and different failure modes:
 * a manager correcting a school name must not be able to fail a student's
 * learning goal, and a success message must never claim more than it did.
 *
 * The two rules that matter:
 *
 * - a draft is never discarded on failure, including on a conflict. Whoever
 *   typed it can still see it, compare, and decide;
 * - the draft resets only when the server's revision moves, so a save
 *   elsewhere on the page cannot wipe what someone is halfway through typing.
 */
export type SectionStatus = 'idle' | 'saving' | 'saved' | 'conflict' | 'failed';

export type ProfileSection<TDraft> = {
  draft: TDraft;
  /** Patch one or more fields. Clears a stale "Saved" acknowledgement. */
  set: (patch: Partial<TDraft>) => void;
  dirty: boolean;
  status: SectionStatus;
  error: unknown;
  save: () => void;
  /** Throw the draft away and take the server's current values. */
  reset: () => void;
};

export function useProfileSection<TDraft extends object>(
  serverValue: TDraft,
  revision: string | null,
  commit: (draft: TDraft, expectedUpdatedAt: string | null) => Promise<unknown>,
): ProfileSection<TDraft> {
  const [draft, setDraft] = useState<TDraft>(serverValue);
  const [status, setStatus] = useState<SectionStatus>('idle');
  const [error, setError] = useState<unknown>(null);
  const [syncedRevision, setSyncedRevision] = useState(revision);
  const dirty = !sameDraft(draft, serverValue);

  // Adjusting state during render, deliberately: the alternative is an effect
  // that runs one frame late and briefly shows the previous academy's values
  // after a switch.
  //
  // Only for a section nobody is halfway through. Two sections can share one
  // row's revision — the account name and the language preference are both
  // columns on `users` — so saving one moves the other's revision. Taking the
  // server's values there would erase whatever was being typed, which is the
  // one thing this hook exists to prevent. The cost is that the untouched
  // section now holds a stale revision and its next save answers
  // `PROFILE_CHANGED`; that surfaces the conflict panel with the draft intact
  // and a button to load current values, which is a recoverable annoyance
  // rather than lost work.
  if (revision !== syncedRevision && !dirty) {
    setSyncedRevision(revision);
    setDraft(serverValue);
    // A successful mutation writes the returned response into the query cache
    // before its promise settles. Preserve `saving` through that render so the
    // completion handler can publish the visible/live-region `saved` state.
    // Revisions arriving for any other reason clear stale acknowledgements.
    if (status !== 'saving' && status !== 'saved') setStatus('idle');
    setError(null);
  }

  const set = useCallback((patch: Partial<TDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setStatus((current) => (current === 'saved' ? 'idle' : current));
  }, []);

  const save = useCallback(() => {
    setStatus('saving');
    setError(null);
    void commit(draft, syncedRevision).then(
      () => setStatus('saved'),
      (reason: unknown) => {
        setError(reason);
        setStatus(
          toApiError(reason).code === 'PROFILE_CHANGED' ? 'conflict' : 'failed',
        );
      },
    );
  }, [commit, draft, syncedRevision]);

  // "Load current values": the explicit way out of a conflict, and the only
  // path that discards a draft. Takes the revision too, so the next save names
  // the row as it stands now.
  const reset = useCallback(() => {
    setDraft(serverValue);
    setSyncedRevision(revision);
    setStatus('idle');
    setError(null);
  }, [revision, serverValue]);

  return {
    draft,
    set,
    dirty,
    status,
    error,
    save,
    reset,
  };
}

/**
 * Shallow equality with array support — the only shapes a profile section
 * holds are scalars and string arrays, and a deep-equality dependency for two
 * cases would be a dependency nobody can justify.
 */
function sameDraft<T extends object>(a: T, b: T): boolean {
  return (Object.keys(a) as (keyof T)[]).every((key) => {
    const left = a[key];
    const right = b[key];
    if (Array.isArray(left) && Array.isArray(right)) {
      return (
        left.length === right.length &&
        left.every((value, index) => value === right[index])
      );
    }
    return left === right;
  });
}
