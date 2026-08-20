import { pointerIsPlaceable, type CollaborationPointer } from '@cove/shared';
import { describe, expect, it } from 'vitest';

import { iframePointToViewport } from './iframe-pointer-capture';
import {
  fromCanvasPosition,
  pointDirection,
  toCanvasPosition,
  toSurfaceFraction,
  toViewportPoint,
} from './surfaces';

const material = '20000000-0000-4000-8000-000000000001';

/** One canvas, as two screens at different scales see it. */
const canvasAt = (scale: number, left: number, top: number) => ({
  left,
  top,
  width: 640 * scale,
  height: 900 * scale,
});

describe('the scale divides out of a shared position', () => {
  it('places the same content at the same fraction on both screens', () => {
    const sender = canvasAt(1.25, 100, 40);
    const receiver = canvasAt(0.7, 12, -300);

    // A point one quarter across and three fifths down the sender's canvas.
    const point = {
      clientX: sender.left + sender.width * 0.25,
      clientY: sender.top + sender.height * 0.6,
    };
    const fraction = toSurfaceFraction(point, sender);
    expect(fraction).toEqual({ x: 0.25, y: 0.6 });

    const placed = toViewportPoint(fraction!, receiver);
    expect(placed.left).toBeCloseTo(receiver.left + receiver.width * 0.25);
    expect(placed.top).toBeCloseTo(receiver.top + receiver.height * 0.6);
  });

  it('is unaffected by how wide either pane happens to be', () => {
    const point = { clientX: 300, clientY: 500 };
    const wide = toSurfaceFraction(point, canvasAt(1.4, 0, 0));
    const narrow = toSurfaceFraction(
      { clientX: point.clientX / 2, clientY: point.clientY / 2 },
      canvasAt(0.7, 0, 0),
    );
    expect(wide).toEqual(narrow);
  });
});

describe('iframePointToViewport under a scaled ancestor', () => {
  it('converts the frame-local point out of logical space', () => {
    // The inner document reports logical pixels; the frame's box is scaled.
    // Adding the two directly is wrong by exactly the scale.
    const frameBox = { left: 100, top: 50, width: 320, height: 400 };
    expect(
      iframePointToViewport({ clientX: 200, clientY: 100 }, frameBox, 0.5),
    ).toEqual({ clientX: 200, clientY: 100 });
  });

  it('is the identity mapping wherever nothing is scaled', () => {
    const frameBox = { left: 100, top: 50, width: 640, height: 400 };
    expect(
      iframePointToViewport({ clientX: 30, clientY: 20 }, frameBox),
    ).toEqual({ clientX: 130, clientY: 70 });
  });
});

describe('pointerIsPlaceable', () => {
  const canvasPointer: CollaborationPointer = {
    surface: 'statement',
    x: 0.5,
    y: 0.5,
    space: 'canvas',
    material,
  };

  it('draws a canvas position only for the same document', () => {
    expect(pointerIsPlaceable(canvasPointer, { space: 'canvas', material })).toBe(
      true,
    );
    // A teacher previewing another exercise: the fraction maps perfectly and
    // means something entirely different.
    expect(
      pointerIsPlaceable(canvasPointer, {
        space: 'canvas',
        material: '30000000-0000-4000-8000-000000000002',
      }),
    ).toBe(false);
  });

  it('refuses a canvas position it cannot attribute', () => {
    expect(
      pointerIsPlaceable(canvasPointer, { space: 'canvas', material: null }),
    ).toBe(false);
    expect(
      pointerIsPlaceable(
        { space: 'canvas', material: null },
        { space: 'canvas', material },
      ),
    ).toBe(false);
  });

  it('never mixes the two spaces', () => {
    // Both are numbers in 0..1 and mean different things. Falling back from one
    // to the other is the original bug.
    expect(
      pointerIsPlaceable(canvasPointer, { space: 'surface', material: null }),
    ).toBe(false);
    expect(
      pointerIsPlaceable(
        { space: 'surface', material: null },
        { space: 'canvas', material },
      ),
    ).toBe(false);
  });

  it('leaves every non-canvas surface exactly as it was', () => {
    // The terminal, editor and curriculum have no material and never claimed
    // this much precision; demanding one would refuse all of them.
    expect(
      pointerIsPlaceable(
        { space: 'surface', material: null },
        { space: 'surface', material: null },
      ),
    ).toBe(true);
  });
});

describe('pointDirection', () => {
  const pane = { left: 0, top: 100, width: 500, height: 400 };

  it('says which way to look when the position is off the pane', () => {
    expect(pointDirection({ left: 10, top: 40 }, pane)).toBe('above');
    expect(pointDirection({ left: 10, top: 900 }, pane)).toBe('below');
  });

  it('is null when the arrow itself can be drawn', () => {
    expect(pointDirection({ left: 10, top: 300 }, pane)).toBeNull();
  });
});


describe('canvas positions do not depend on the content height', () => {
  // The teacher sees every hint, so their statement is taller than the
  // student's. Dividing by that height put the two arrows on different lines,
  // further apart the further down the page they were.
  const teacher = { left: 100, top: 0, width: 640, height: 4000 };
  const student = { left: 20, top: 0, width: 640, height: 2600 };

  it('places the same content at the same place despite different heights', () => {
    const point = { clientX: teacher.left + 320, clientY: teacher.top + 1800 };
    const position = toCanvasPosition(point, teacher);
    expect(position).toEqual({ x: 0.5, y: 1800 / 640 });

    const placed = fromCanvasPosition(position!, student);
    // 1800 logical pixels down on both, not "the same fraction of a different
    // document".
    expect(placed.top).toBeCloseTo(student.top + 1800);
    expect(placed.left).toBeCloseTo(student.left + 320);
  });

  it('still divides the scale out', () => {
    const scaled = { left: 0, top: 0, width: 640 * 0.7, height: 2600 * 0.7 };
    const position = toCanvasPosition(
      { clientX: 640 * 0.7 * 0.5, clientY: 1800 * 0.7 },
      scaled,
    );
    expect(position!.x).toBeCloseTo(0.5);
    expect(position!.y).toBeCloseTo(1800 / 640);
  });

  it('reaches past one canvas width, which a fraction could not', () => {
    const position = toCanvasPosition(
      { clientX: 100, clientY: 3200 },
      { left: 0, top: 0, width: 640, height: 4000 },
    );
    expect(position!.y).toBe(5);
  });
});
