import { describe, expect, it } from 'vitest';

import { meetsBrowserBaseline } from './browser-baseline';

const supportsColorMix = () => true;
const lacksColorMix = () => false;

describe('meetsBrowserBaseline', () => {
  it('accepts a browser with color-mix() and @property', () => {
    expect(meetsBrowserBaseline({ supports: supportsColorMix, hasPropertyRule: true })).toBe(true);
  });

  it('rejects Safari before 16.4, which has color-mix() but not @property', () => {
    expect(meetsBrowserBaseline({ supports: supportsColorMix, hasPropertyRule: false })).toBe(false);
  });

  it('rejects a browser without color-mix()', () => {
    expect(meetsBrowserBaseline({ supports: lacksColorMix, hasPropertyRule: true })).toBe(false);
  });

  it('rejects a browser without CSS.supports at all', () => {
    expect(meetsBrowserBaseline({ hasPropertyRule: true })).toBe(false);
  });
});
