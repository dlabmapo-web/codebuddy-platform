import { describe, expect, it } from 'vitest';
import { restoreReadingAnchor } from './reading-position';

describe('reading anchor restoration', () => {
  it('preserves the content offset instead of the old absolute scroll offset', () => {
    const pane = { scrollTop: 500, getBoundingClientRect: () => ({ top: 100 }) };
    expect(restoreReadingAnchor({ top: () => 250, offset: 10 }, pane as unknown as HTMLElement)).toBe(true);
    expect(pane.scrollTop).toBe(640);
  });
  it('does not restore a detached document or move an already aligned anchor', () => {
    const pane = { scrollTop: 500, getBoundingClientRect: () => ({ top: 100 }) };
    expect(restoreReadingAnchor({ top: () => null, offset: 10 }, pane as unknown as HTMLElement)).toBe(false);
    restoreReadingAnchor({ top: () => 110, offset: 10 }, pane as unknown as HTMLElement);
    expect(pane.scrollTop).toBe(500);
  });
});
