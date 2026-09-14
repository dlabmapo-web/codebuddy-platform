import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/workspace/statement-canvas', () => ({
  STATEMENT_CANVAS_WIDTH: 640,
  useStatementCanvas: (active: boolean) => ({
    paneRef: { current: null }, canvasRef: { current: null },
    engaged: active, scale: 0.8, contentHeight: 2000,
  }),
}));
import { StatementCanvas } from './statement-canvas';

const render = (active: boolean) => renderToStaticMarkup(
  <StatementCanvas active={active} material="problem" surface="statement">
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
