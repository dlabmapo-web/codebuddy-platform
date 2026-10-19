import { describe, expect, it } from 'vitest';
import { sourceOrder } from './dlab-source.service.js';
describe('DLAB source ordering', () => {
  const older = new Date('2026-01-01T00:00:00Z'), newer = new Date('2026-01-02T00:00:00Z');
  it('does not overwrite newer data with an old event', () => expect(sourceOrder(newer, older, 'a', 'b')).toBe('noop'));
  it('accepts a newer event', () => expect(sourceOrder(older, newer, 'a', 'b')).toBe('apply'));
  it('accepts duplicate equal-version payloads as no-ops', () => expect(sourceOrder(newer, newer, 'a', 'a')).toBe('noop'));
  it('rejects conflicting equal-version payloads', () => expect(() => sourceOrder(newer, newer, 'a', 'b')).toThrow('conflicting_source_version'));
});
