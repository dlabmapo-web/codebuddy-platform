import { describe, expect, it } from 'vitest';

import {
  parseRankingQuery,
  rankingListInput,
  rankingListKey,
  rankingPath,
  serializeRankingQuery,
} from './ranking-query';

const classId = '30000000-0000-4000-8000-000000000003';
const academyId = '10000000-0000-4000-8000-000000000001';

describe('parseRankingQuery', () => {
  it('opens on points, descending, today', () => {
    expect(parseRankingQuery('')).toMatchObject({
      period: 'day',
      sort: 'points',
      direction: 'desc',
      page: 1,
      classId: null,
      academyId: null,
    });
  });

  it('falls back rather than throwing on an unparseable address', () => {
    // A query string arrives from bookmarks and chat messages. An invalid one
    // is a page, not an error.
    const query = parseRankingQuery(
      'sort=salary&dir=sideways&period=fortnight&page=-3&class=nope',
    );

    expect(query).toMatchObject({
      sort: 'points',
      direction: 'desc',
      period: 'day',
      page: 1,
      classId: null,
    });
  });

  it('reads the facet and the open board as two different things', () => {
    const query = parseRankingQuery(
      `in=${academyId}&class=${classId}&academy=${academyId}`,
    );

    expect(query.academyIds).toEqual([academyId]);
    expect(query.classId).toBe(classId);
    expect(query.academyId).toBe(academyId);
  });
});

describe('serializeRankingQuery', () => {
  it('omits every default, so an untouched address is empty', () => {
    expect(serializeRankingQuery(parseRankingQuery(''))).toBe('');
    expect(rankingPath(parseRankingQuery(''))).toBe('/admin/ranking');
  });

  it('round-trips a fully specified address', () => {
    const search = `q=python&in=${academyId}&period=week&sort=students&dir=asc&page=3&class=${classId}&academy=${academyId}`;
    const parsed = parseRankingQuery(search);

    expect(parseRankingQuery(serializeRankingQuery(parsed))).toEqual(parsed);
  });
});

describe('rankingListInput', () => {
  it('drops the open class, which is page state and not a filter', () => {
    // Sending it would narrow the table to the single row the operator just
    // opened.
    const query = parseRankingQuery(`class=${classId}&academy=${academyId}`);
    const input = rankingListInput(query);

    expect(input).not.toHaveProperty('classId');
    expect(input).not.toHaveProperty('academyId');
  });

  it('gives one key whatever class is open, so opening a board refetches nothing', () => {
    const closed = parseRankingQuery('sort=students');
    const open = parseRankingQuery(
      `sort=students&class=${classId}&academy=${academyId}`,
    );

    expect(rankingListKey(open)).toBe(rankingListKey(closed));
  });
});
