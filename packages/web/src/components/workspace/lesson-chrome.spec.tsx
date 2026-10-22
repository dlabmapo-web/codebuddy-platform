import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/i18n', () => ({ useLayoutTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('./use-practice-translation', () => ({ usePracticeTranslation: () => ({ t: (key: string) => key }) }));
import { LessonFooter, LessonHeader } from './lesson-chrome';

describe('common lesson navigation', () => {
  it('keeps the current material identity and permitted actions together', () => {
    const html = renderToStaticMarkup(<LessonHeader courseTitle="Python" lectureTitle="Addition" title="Reference PDF" leaveHref="/course"><button>Edit</button></LessonHeader>);
    expect(html).toContain('Python / Addition');
    expect(html).toContain('<h1');
    expect(html).toContain('Reference PDF');
    expect(html).toContain('href="/course"');
    expect(html).toContain('Edit');
    expect(html).not.toContain('Tutoring');
  });
  it('keeps both navigation positions visible at the first material', () => {
    const html = renderToStaticMarkup(<LessonFooter index={1} total={3} next={{ href: '/quiz' }} />);
    expect(html).toContain('aria-label="workspace.previous"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('href="/quiz"');
    expect(html).toContain('1 / 3');
  });
  it('cannot follow a destination while a save or submission blocks navigation', () => {
    const html = renderToStaticMarkup(<LessonFooter index={2} total={3} previous={{ href: '/pdf' }} next={{ href: '/video' }} disabled />);
    expect(html).not.toContain('href=');
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });
});
