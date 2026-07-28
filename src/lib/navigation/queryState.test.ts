import { describe, expect, it } from 'vitest';
import {
  normalizeCurriculumQuery,
  routeWithQuery,
  updateQueryString,
} from './queryState';

describe('navigation query state', () => {
  it('preserves unrelated values and removes defaults', () => {
    expect(updateQueryString('stage=1&q=matrix', {
      q: '',
      chapter: '2',
    })).toBe('stage=1&chapter=2');
  });

  it('builds routes without a trailing question mark', () => {
    expect(routeWithQuery('/students', 'status=online', { status: null }))
      .toBe('/students');
  });

  it('removes invalid curriculum descendants', () => {
    expect(normalizeCurriculumQuery({
      subjectId: null,
      stageId: 'stage-1',
      chapterId: 'chapter-1',
    })).toEqual({ subject: null, stage: null, chapter: null });
    expect(normalizeCurriculumQuery({
      subjectId: 'subject-1',
      stageId: 'stage-1',
      chapterId: 'chapter-1',
    })).toEqual({
      subject: 'subject-1',
      stage: 'stage-1',
      chapter: 'chapter-1',
    });
  });
});

