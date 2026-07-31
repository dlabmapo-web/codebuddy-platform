import { describe, expect, it } from 'vitest';

import { resolveSaveState, shouldSyncDraft } from './draft-store';

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
