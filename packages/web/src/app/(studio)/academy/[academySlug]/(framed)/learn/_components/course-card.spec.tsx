import * as React from 'react';
import type { LearnCourseSummary } from '@cove/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n', () => ({
  useLayoutTranslation: () => ({ t: (key: string, values?: { count?: number }) => `${key}:${values?.count ?? ''}` }),
}));
vi.mock('@/components/studio/academy-route-provider', () => ({ useAcademySlug: () => 'dlab' }));
import { CourseCard } from './course-card';

const course = (counts: Partial<LearnCourseSummary['counts']>): LearnCourseSummary => ({
  courseId: '00000000-0000-4000-8000-000000000001',
  title: 'Python',
  description: '',
  counts: { modules: 1, lectures: 1, exercises: 0, ...counts },
  progress: { total: counts.exercises ?? 0, started: 0, solved: 0 },
} as LearnCourseSummary);

const line = (counts: Partial<LearnCourseSummary['counts']>) =>
  renderToStaticMarkup(<CourseCard academyId="a" course={course(counts)} />)
    .match(/<p class="text-\[15px\][^>]*>(.*?)<\/p>/)?.[1];

describe('course card counts (QA S-02)', () => {
  it('leads with theory (PDFs and explanations), then problems', () => {
    expect(line({ exercises: 95, documents: 12, explanations: 3 })).toBe('catalog.theory:15 · catalog.problems:95');
  });
  it('shows problems alone when there is no theory', () => {
    expect(line({ exercises: 95 })).toBe('catalog.problems:95');
  });
  it('does not lead a reading-only course with zero problems', () => {
    expect(line({ documents: 4 })).toBe('catalog.theory:4');
  });
  it('still says zero problems for an empty course', () => {
    expect(line({})).toBe('catalog.problems:0');
  });
});
