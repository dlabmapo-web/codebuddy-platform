import { describe, expect, it } from 'vitest';

import {
  clampFontSize,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
} from './use-editor-preferences';

describe('clampFontSize', () => {
  it('holds the editor inside a readable range', () => {
    expect(clampFontSize(2)).toBe(MIN_FONT_SIZE);
    expect(clampFontSize(99)).toBe(MAX_FONT_SIZE);
    expect(clampFontSize(14)).toBe(14);
  });

  it('falls back to a default for unusable stored values', () => {
    // localStorage returns strings; a corrupted one must not blank the editor.
    expect(clampFontSize(Number('nonsense'))).toBe(13);
  });
});
