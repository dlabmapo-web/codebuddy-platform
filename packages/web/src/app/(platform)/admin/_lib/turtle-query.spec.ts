import { describe, expect, it } from 'vitest';

import { customTurtleRange, parseTurtleQuery, turtleInput, turtlePath } from './turtle-query';

const academy = '10000000-0000-4000-8000-000000000001';
// 00:30 on the 25th in Seoul, still the 24th in UTC.
const now = new Date('2026-11-24T15:30:00Z');

describe('turtle usage address', () => {
  it('round-trips every kind of selection', () => {
    for (const path of ['', 'period=7d', `period=30d&academy=${academy}`, 'from=2026-11-01&to=2026-11-03'])
      expect(turtlePath(parseTurtleQuery(path))).toBe(path ? `/admin/turtle?${path}` : '/admin/turtle');
  });
  it('falls back to today for anything invalid', () => {
    for (const path of ['period=year', 'from=2026-02-30&to=2026-03-01', 'from=2026-11-03&to=2026-11-01', 'from=2025-01-01&to=2026-11-01', 'academy=x'])
      expect(parseTurtleQuery(path)).toEqual({ period: 'today', academyId: undefined });
  });
  it('counts days in Seoul', () => {
    expect(turtleInput({ period: 'today' }, now)).toEqual({ from: '2026-11-25', to: '2026-11-25' });
    expect(turtleInput({ period: 'yesterday' }, now)).toEqual({ from: '2026-11-24', to: '2026-11-24' });
    expect(turtleInput({ period: '7d', academyId: academy }, now)).toEqual({ from: '2026-11-19', to: '2026-11-25', academyId: academy });
  });
  it('keeps hand-picked dates ordered and within range', () => {
    expect(customTurtleRange('2026-11-10', '2026-11-01', 'from')).toEqual({ from: '2026-11-10', to: '2026-11-10' });
    expect(customTurtleRange('2026-11-10', '2026-11-01', 'to')).toEqual({ from: '2026-11-01', to: '2026-11-01' });
    expect(customTurtleRange('2026-01-01', '2026-11-24', 'from')).toEqual({ from: '2026-01-01', to: '2026-06-29' });
    expect(customTurtleRange('', '2026-11-24', 'from')).toBeNull();
  });
});
