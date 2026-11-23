import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/workspace/statement-canvas', () => ({
  STATEMENT_CANVAS_WIDTH: 640,
  useStatementCanvas: (active: boolean, _material: string, logicalWidth: number | null) => ({
    paneRef: { current: null }, canvasRef: { current: null },
    engaged: active, scale: logicalWidth === null ? 1 : 0.8, contentHeight: 2000, paneWidth: 530,
  }),
}));
import { StatementCanvas } from './statement-canvas';

const render = (active: boolean, logicalWidth: number | null = null) => renderToStaticMarkup(
  <StatementCanvas active={active} logicalWidth={logicalWidth} material="problem" surface="statement">
    <div><iframe title="Problem" /></div>
  </StatementCanvas>,
);

describe('statement canvas topology', () => {
  it('keeps the same parent chain for the authored iframe in both modes', () => {
    const topology = (html: string) => html.match(/<\/?(?:div|iframe)\b[^>]*>/g)?.map((tag) => tag.replace(/\s[^>]*>/, '>'));
    expect(topology(render(false))).toEqual(topology(render(true)));
    expect(render(false)).not.toContain('data-collab-canvas');
    expect(render(true)).toContain('data-collab-canvas');
  });
});

describe('statement canvas while watched (QA S-10)', () => {
  it('leaves the student\'s own layout untouched: no fixed width, no scale', () => {
    const html = render(true);
    expect(html).toContain('data-collab-canvas="statement"');
    expect(html).not.toContain('transform');
    expect(html).not.toContain('width:');
  });
  it('lays a teacher\'s copy out at the student\'s width and scales it', () => {
    const html = render(true, 530);
    expect(html).toContain('width:530px');
    expect(html).toContain('transform:scale(0.8)');
    expect(html).toContain('data-collab-canvas="statement"');
  });
});
