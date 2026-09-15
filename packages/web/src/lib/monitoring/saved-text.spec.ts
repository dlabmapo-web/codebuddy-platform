import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { SavedTextTracker } from './saved-text';

const hash = (code: string) => createHash('sha256').update(code).digest('hex');

describe('saved text confirmation', () => {
  it('does not clear a later edit when an earlier write finishes', async () => {
    let code = 'first';
    const report = vi.fn();
    const tracker = new SavedTextTracker(() => code, report);
    code = 'first and later';
    tracker.changed();
    await tracker.confirm(hash('first'));
    expect(report).toHaveBeenLastCalledWith(true);
    await tracker.confirm(hash(code));
    expect(report).toHaveBeenLastCalledWith(false);
  });

  it('detects deletion-only changes, which a Yjs state vector cannot identify', async () => {
    const report = vi.fn();
    const tracker = new SavedTextTracker(() => 'ab', report);
    await tracker.confirm(hash('abc'));
    expect(report).toHaveBeenLastCalledWith(true);
  });

  it('does not publish a hash result after another edit or document replacement', async () => {
    let code = 'same text';
    const report = vi.fn();
    const tracker = new SavedTextTracker(() => code, report);
    const pending = tracker.confirm(hash(code));
    tracker.changed();
    code = 'new exercise';
    await pending;
    expect(report).not.toHaveBeenCalledWith(false);
  });

  it('ignores asynchronous confirmations superseded by a newer failure', async () => {
    const report = vi.fn();
    const tracker = new SavedTextTracker(() => 'code', report);
    const pending = tracker.confirm(hash('code'));
    tracker.changed();
    await pending;
    expect(report).toHaveBeenLastCalledWith(true);
  });

  it('does not trust an unversioned legacy Saved event', async () => {
    const report = vi.fn();
    const tracker = new SavedTextTracker(() => 'code', report);
    await tracker.confirm(undefined);
    expect(report).toHaveBeenLastCalledWith(true);
  });
});
