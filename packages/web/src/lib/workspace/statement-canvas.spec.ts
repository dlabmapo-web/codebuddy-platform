import { describe, expect, it } from 'vitest';

import {
  STATEMENT_CANVAS_MAX_SCALE,
  STATEMENT_CANVAS_MIN_SCALE,
  STATEMENT_CANVAS_MIN_WIDTH,
  STATEMENT_CANVAS_WIDTH,
  statementCanvasScale,
} from './statement-canvas';

describe('statementCanvasScale', () => {
  it('fits the canvas to the pane', () => {
    expect(statementCanvasScale(STATEMENT_CANVAS_WIDTH)).toBe(1);
    expect(statementCanvasScale(STATEMENT_CANVAS_WIDTH / 2)).toBe(
      STATEMENT_CANVAS_MIN_SCALE,
    );
  });

  it('clamps rather than rendering unreadable or absurd type', () => {
    expect(statementCanvasScale(80)).toBe(STATEMENT_CANVAS_MIN_SCALE);
    expect(statementCanvasScale(4000)).toBe(STATEMENT_CANVAS_MAX_SCALE);
  });

  it('is 1 before the pane has been measured', () => {
    // A zero or absent measurement is the first frame, not a tiny pane. Scaling
    // to it would flash the statement at its smallest before settling.
    expect(statementCanvasScale(0)).toBe(1);
    expect(statementCanvasScale(Number.NaN)).toBe(1);
  });

  it('reaches exactly the floor at the minimum pane width', () => {
    // The split pane is clamped to this width precisely so the scale never has
    // to be clamped in practice; if the two drift apart the pane can be dragged
    // narrower than the canvas can honestly represent.
    expect(statementCanvasScale(STATEMENT_CANVAS_MIN_WIDTH)).toBeCloseTo(
      STATEMENT_CANVAS_MIN_SCALE,
    );
  });
});
