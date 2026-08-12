import { describe, expect, it } from 'vitest';

import {
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
  const base = { dirty: false, syncing: false, failed: false, everSynced: false };

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
  });

  /** An untouched view is not unsaved work, so the header stays quiet. */
  it('reports nothing to save while the attempt is only being read', () => {
    expect(
      resolveSaveState({
        dirty: false,
        syncing: false,
        failed: false,
        everSynced: false,
      }),
    ).toBe('idle');
  });
});
