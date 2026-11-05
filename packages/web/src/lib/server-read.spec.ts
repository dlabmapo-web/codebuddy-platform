// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

import { claimServerRead } from './server-read';

describe('claimServerRead', () => {
  it('lets a server read seed the client once, never for a replayed payload', () => {
    expect(claimServerRead('render-1')).toBe(true);
    // Back/forward navigation can replay the same payload; it reads normally.
    expect(claimServerRead('render-1')).toBe(false);
    expect(claimServerRead('render-2')).toBe(true);
  });

  it('never seeds without a token', () => {
    expect(claimServerRead(undefined)).toBe(false);
  });
});
