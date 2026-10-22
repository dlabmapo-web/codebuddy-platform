import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n', () => ({ useLayoutTranslation: () => ({ t: (key: string) => key }) }));
import { MaterialIdentity, MaterialLink } from './material-identity';

describe('material identities', () => {
  it.each([
    ['PROGRAMMING_EXERCISE', 'coding'], ['PDF_DOCUMENT', 'pdf'],
    ['VIDEO_LESSON', 'video'], ['MULTIPLE_CHOICE', 'quiz'],
    ['WRITTEN_RESPONSE', 'written'], ['TURTLE_EXERCISE', 'turtle'],
  ])('identifies %s with a visible type and decorative icon', (type, label) => {
    const html = renderToStaticMarkup(<MaterialIdentity title="Lesson" type={type} />);
    expect(html).toContain(`materials.${label}`);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('Lesson');
  });

  it('distinguishes an attached reference PDF from a standalone PDF document', () => {
    expect(renderToStaticMarkup(<MaterialIdentity title="Practice" type="PROGRAMMING_EXERCISE" hasReferencePdf />)).toContain('materials.pdf_coding');
  });

  it('makes the whole labelled material a link to its own destination', () => {
    const html = renderToStaticMarkup(<MaterialLink title="Read the PDF" type="PDF_DOCUMENT" href="/learn/documents/pdf-id">2 pages</MaterialLink>);
    expect(html).toContain('href="/learn/documents/pdf-id"');
    expect(html).toContain('Read the PDF');
    expect(html).toContain('2 pages');
    expect(html.match(/<a /g)).toHaveLength(1);
  });
});
