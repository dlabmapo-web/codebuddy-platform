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

  it('sends the reader to the page it is not on, and nowhere else', () => {
    const html = renderToStaticMarkup(
      <ContentSummary active="courses" summary={base} />,
    );
    // One link, to the other page. The tile for the page you are on is not a
    // link, and Problems never is — there is no problems page to open.
    expect(html.match(/href="/g)).toHaveLength(1);
    expect(html).toContain('href="/admin/content/classes"');
    expect(html).not.toContain('/admin/content/courses');
    expect(html).not.toContain('/admin/content/problems');
  });

  it('marks the page the reader is on', () => {
    const html = renderToStaticMarkup(
      <ContentSummary active="classes" summary={base} />,
    );
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('href="/admin/content/courses"');
    expect(html).not.toContain('href="/admin/content/classes"');
  });

  it('names the academy the counts belong to', () => {
    const html = renderToStaticMarkup(
      <ContentSummary
        academy={{ name: 'D.Lab Mapo', slug: 'mapo' }}
        active="courses"
        summary={base}
      />,
    );
    expect(html).toContain('D.Lab Mapo');
    expect(html).toContain('/mapo');
    // The academy count is the platform-wide reading. Printing it beside one
    // academy's name would say "D.Lab Mapo, across 2 academies".
    expect(html).not.toContain('summary.scope');
  });

  it('counts the academies when the scope is wider than one', () => {
    const html = renderToStaticMarkup(
      <ContentSummary active="courses" summary={base} />,
    );
    expect(html).toContain('summary.scope:2');
    expect(html).toContain('summary.heading');
  });
});
