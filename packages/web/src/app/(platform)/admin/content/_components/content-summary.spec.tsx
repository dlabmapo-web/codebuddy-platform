import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { count?: number }) =>
      values?.count === undefined ? key : `${key}:${values.count}`,
  }),
}));

const { ContentSummary } = await import('./content-summary');

const base = {
  academies: 2,
  courses: { total: 4, published: 3 },
  classes: { total: 3, running: 2, withoutTeacher: 0 },
  problems: { total: 8, withoutTests: 0 },
};

describe('ContentSummary', () => {
  it('keeps a zero fault quiet', () => {
    const html = renderToStaticMarkup(
      <ContentSummary active="courses" summary={base} />,
    );
    expect(html).toContain('summary.no_teacher:0');
    expect(html).not.toContain('text-danger');
  });

  it('makes a non-zero fault loud', () => {
    const html = renderToStaticMarkup(
      <ContentSummary
        active="classes"
        summary={{ ...base, classes: { ...base.classes, withoutTeacher: 2 } }}
      />,
    );
    expect(html).toContain('summary.no_teacher:2');
    expect(html).toContain('text-danger');
  });
});
