import { describe, expect, it } from 'vitest';

import { iframePointToViewport } from './iframe-pointer-capture';
import { isBoxVisible, toSurfaceFraction, toViewportPoint } from './surfaces';

const box = { left: 100, top: 50, width: 400, height: 200 };

describe('toSurfaceFraction', () => {
  it('reports a point as the fraction of the surface it sits at', () => {
    expect(toSurfaceFraction({ clientX: 300, clientY: 150 }, box)).toEqual({
      x: 0.5,
      y: 0.5,
    });
  });

  it('clamps a point dragged outside the surface to its edge', () => {
    // Pointer capture keeps delivering moves past the box during a drag, and a
    // fraction above 1 is refused by the wire schema.
    expect(toSurfaceFraction({ clientX: 900, clientY: -40 }, box)).toEqual({
      x: 1,
      y: 0,
    });
  });

  it('refuses a collapsed surface rather than dividing by zero', () => {
    expect(
      toSurfaceFraction({ clientX: 10, clientY: 10 }, { ...box, width: 0 }),
    ).toBeNull();
  });
});

describe('iframePointToViewport', () => {
  it('translates a frame-local point into the parent viewport', () => {
    expect(
      iframePointToViewport(
        { clientX: 32, clientY: 18 },
        { left: 120, top: 80, width: 500, height: 240 },
      ),
    ).toEqual({ clientX: 152, clientY: 98 });
  });
});

describe('toViewportPoint', () => {
  it('places the peer fraction on this reader s own layout', () => {
    // The same fraction lands somewhere else when the pane is a different
    // size, which is the entire point of sending fractions.
    expect(toViewportPoint({ x: 0.25, y: 0.5 }, box)).toEqual({
      left: 200,
      top: 150,
    });
    expect(
      toViewportPoint({ x: 0.25, y: 0.5 }, { ...box, width: 800 }),
    ).toEqual({ left: 300, top: 150 });
  });
});

describe('isBoxVisible', () => {
  const viewport = { width: 1280, height: 800 };

  it('accepts a surface on screen', () => {
    expect(isBoxVisible(box, viewport)).toBe(true);
  });

  it('rejects a surface scrolled past either edge', () => {
    expect(isBoxVisible({ ...box, top: -300 }, viewport)).toBe(false);
    expect(isBoxVisible({ ...box, top: 900 }, viewport)).toBe(false);
    expect(isBoxVisible({ ...box, left: -500 }, viewport)).toBe(false);
  });

  it('rejects a collapsed pane', () => {
    // A hidden pane has a rect; drawing on it would pin the pointer to a
    // corner and claim the peer is looking there.
    expect(isBoxVisible({ ...box, height: 0 }, viewport)).toBe(false);
  });
});
