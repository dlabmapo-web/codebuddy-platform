import { describe, expect, it } from 'vitest';

import {
  canSeedCollaboration,
  isPageLeaving,
  localDraftKey,
  promotesReviewBuffer,
  resolveReviewBuffer,
  resolveSaveState,
  shouldPersistOnHide,
  shouldSyncDraft,
} from './draft-store';

describe('shouldSyncDraft', () => {
  it('syncs when nothing has been synced yet', () => {
    expect(shouldSyncDraft({ code: 'x', lastSyncedCode: null })).toBe(true);
  });

  it('skips a sync when the server already holds this code', () => {
    expect(shouldSyncDraft({ code: 'x', lastSyncedCode: 'x' })).toBe(false);
  });

  it('syncs an emptied editor', () => {
    // Clearing the editor is a real edit and must reach the server, or a
    // reload on another device silently restores deleted work.
    expect(shouldSyncDraft({ code: '', lastSyncedCode: 'x' })).toBe(true);
  });

  it('treats whitespace-only changes as real', () => {
    expect(shouldSyncDraft({ code: 'x ', lastSyncedCode: 'x' })).toBe(true);
  });
});

describe('resolveSaveState', () => {
  const base = {
    dirty: false,
    syncing: false,
    failed: false,
    conflict: false,
    everSynced: false,
  };

  it('is idle before anything happens', () => {
    expect(resolveSaveState(base)).toBe('idle');
  });

  it('reports local-only while edits are pending', () => {
    expect(resolveSaveState({ ...base, dirty: true })).toBe('local');
  });

  it('reports saving while a sync is in flight', () => {
    expect(resolveSaveState({ ...base, dirty: true, syncing: true })).toBe(
      'saving',
    );
  });

  it('reports saved once a sync has completed and nothing is pending', () => {
    expect(resolveSaveState({ ...base, everSynced: true })).toBe('saved');
  });

  it('surfaces a failure over a pending edit', () => {
    // A student whose sync is failing needs to know, not to see "saved".
    expect(
      resolveSaveState({ ...base, dirty: true, failed: true, everSynced: true }),
    ).toBe('error');
  });

  it('prefers saving over error while retrying', () => {
    expect(
      resolveSaveState({ ...base, syncing: true, failed: true }),
    ).toBe('saving');
  });
});

/**
 * Entering the workspace from Answer records must not cost the student the
 * draft they already had. The rules that guarantee that live here rather than
 * inside the hook, so they can be checked without a browser.
 */
describe('reviewing a historical submission', () => {
  it('opens the editor on the submitted code', () => {
    expect(
      resolveReviewBuffer({
        historicalCode: 'print("old attempt")',
        draftCode: 'print("my draft")',
        starterCode: '',
      }),
    ).toEqual({ code: 'print("old attempt")', reviewing: true });
  });

  it('opens on the saved draft when no attempt was selected', () => {
    expect(
      resolveReviewBuffer({
        historicalCode: null,
        draftCode: 'print("my draft")',
        starterCode: 'starter',
      }),
    ).toEqual({ code: 'print("my draft")', reviewing: false });
    expect(
      resolveReviewBuffer({
        historicalCode: null,
        draftCode: null,
        starterCode: 'starter',
      }),
    ).toEqual({ code: 'starter', reviewing: false });
  });

  it('never writes an untouched attempt over the saved draft', () => {
    expect(
      shouldPersistOnHide({
        reviewing: true,
        code: 'print("old attempt")',
        lastSyncedCode: 'print("my draft")',
      }),
    ).toBe(false);
  });

  it('persists once the buffer has been promoted', () => {
    expect(
      shouldPersistOnHide({
        reviewing: false,
        code: 'print("edited")',
        lastSyncedCode: 'print("my draft")',
      }),
    ).toBe(true);
  });

  it('promotes on an edit, a submit, and a reset — not on opening or leaving', () => {
    expect(promotesReviewBuffer('edit')).toBe(true);
    expect(promotesReviewBuffer('submit')).toBe(true);
    expect(promotesReviewBuffer('reset')).toBe(true);
    expect(promotesReviewBuffer('open')).toBe(false);
    expect(promotesReviewBuffer('navigate')).toBe(false);
    // A teacher opening the student is not a decision to replace their draft
    // with the old attempt they happened to be reading.
    expect(promotesReviewBuffer('collaborate')).toBe(false);
  });

  /** An untouched view is not unsaved work, so the header stays quiet. */
  it('reports nothing to save while the attempt is only being read', () => {
    expect(
      resolveSaveState({
        dirty: false,
        syncing: false,
        failed: false,
        conflict: false,
        everSynced: false,
      }),
    ).toBe('idle');
  });
});

describe('localDraftKey', () => {
  const owner = {
    userId: 'user-1',
    academyId: 'academy-1',
    materialId: 'material-1',
  };

  it('addresses a record by learner, academy, and problem', () => {
    expect(localDraftKey(owner)).toBe('user-1:academy-1:material-1');
  });

  it('gives two learners on one browser profile different records', () => {
    // The fault this exists to remove: one school machine, two students, and
    // a workspace that opened on code its reader never wrote.
    expect(localDraftKey({ ...owner, userId: 'user-2' })).not.toBe(
      localDraftKey(owner),
    );
  });

  it('gives one learner one record per problem', () => {
    expect(localDraftKey({ ...owner, materialId: 'material-2' })).not.toBe(
      localDraftKey(owner),
    );
  });

  it('never collides with a record written before ownership was in the key', () => {
    // Those used the bare material id. They stay unreachable rather than
    // being adopted by whoever opens the problem next: who wrote them cannot
    // be established.
    expect(localDraftKey(owner)).not.toBe(owner.materialId);
  });
});

describe('resolveSaveState when the server refuses a stale buffer', () => {
  const base = {
    dirty: true,
    syncing: false,
    failed: false,
    conflict: false,
    everSynced: true,
  };

  it('reports the refusal rather than a generic failure', () => {
    expect(resolveSaveState({ ...base, conflict: true })).toBe('conflict');
  });

  it('prefers the refusal over a failure, which would suggest retrying', () => {
    expect(resolveSaveState({ ...base, conflict: true, failed: true })).toBe(
      'conflict',
    );
  });

  it('still says saving while a save is actually in flight', () => {
    expect(resolveSaveState({ ...base, conflict: true, syncing: true })).toBe(
      'saving',
    );
  });
});

describe('canSeedCollaboration', () => {
  it('allows the handoff for a settled draft', () => {
    expect(canSeedCollaboration({ hydrated: true, reviewing: false })).toBe(true);
  });

  it('waits for local recovery to answer', () => {
    // On a cached revisit the editor briefly holds the code the workspace
    // query was cached with, which can be older than what is on this machine.
    expect(canSeedCollaboration({ hydrated: false, reviewing: false })).toBe(
      false,
    );
  });

  it('refuses to publish an untouched submission as the student draft', () => {
    // A teacher opening a student who is reading an old attempt must not turn
    // that attempt into their work — and skipping the flush is not enough,
    // because seeding writes it into the document directly.
    expect(canSeedCollaboration({ hydrated: true, reviewing: true })).toBe(false);
  });

  it('stays refused while both are true', () => {
    expect(canSeedCollaboration({ hydrated: false, reviewing: true })).toBe(
      false,
    );
  });

  it('matches the actions that promote a review buffer', () => {
    // Whatever promotes the buffer is what makes it seedable, so the two rules
    // cannot drift apart without this failing.
    for (const action of ['edit', 'submit', 'reset'] as const) {
      expect(promotesReviewBuffer(action)).toBe(true);
    }
    for (const action of ['open', 'navigate', 'collaborate'] as const) {
      expect(promotesReviewBuffer(action)).toBe(false);
    }
  });
});

describe('leaving the page', () => {
  it('beacons a buffer once, however many hide events announce it', () => {
    const draft = { reviewing: false, code: 'print(2)', lastSyncedCode: 'print(1)' };

    expect(shouldPersistOnHide({ ...draft, beaconedCode: null })).toBe(true);
    expect(shouldPersistOnHide({ ...draft, beaconedCode: 'print(2)' })).toBe(false);
    expect(shouldPersistOnHide({ ...draft, beaconedCode: 'print(1)' })).toBe(true);
  });

  it('treats pagehide and a hidden visibilitychange as leaving', () => {
    expect(isPageLeaving('pagehide', 'visible')).toBe(true);
    expect(isPageLeaving('visibilitychange', 'hidden')).toBe(true);
    expect(isPageLeaving('visibilitychange', 'visible')).toBe(false);
  });
});
