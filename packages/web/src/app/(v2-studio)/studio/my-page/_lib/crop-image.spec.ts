import { describe, expect, it } from 'vitest';

import { calculateSquareCrop } from './crop-image';

describe('calculateSquareCrop', () => {
  it('center-crops a landscape image at the default position', () => {
    expect(calculateSquareCrop({
      imageWidth: 1200,
      imageHeight: 800,
      viewportSize: 512,
      position: { zoom: 1, x: 0, y: 0 },
    })).toMatchObject({
      sourceX: 200,
      sourceY: 0,
      sourceSize: 800,
    });
  });

  it('moves within the available source area without exposing empty pixels', () => {
    const left = calculateSquareCrop({
      imageWidth: 1200,
      imageHeight: 800,
      viewportSize: 512,
      position: { zoom: 1, x: 1, y: 0 },
    });
    const right = calculateSquareCrop({
      imageWidth: 1200,
      imageHeight: 800,
      viewportSize: 512,
      position: { zoom: 1, x: -1, y: 0 },
    });

    expect(left.sourceX).toBe(0);
    expect(right.sourceX + right.sourceSize).toBe(1200);
  });

  it('clamps zoom and normalized positions to accessible control limits', () => {
    const crop = calculateSquareCrop({
      imageWidth: 1000,
      imageHeight: 1000,
      viewportSize: 500,
      position: { zoom: 10, x: 4, y: -4 },
    });

    expect(crop.sourceSize).toBeCloseTo(1000 / 3);
    expect(crop.sourceX).toBeCloseTo(0);
    expect(crop.sourceY + crop.sourceSize).toBeCloseTo(1000);
  });
});
