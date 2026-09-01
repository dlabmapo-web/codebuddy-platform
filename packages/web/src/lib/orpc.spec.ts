import { describe, expect, it } from 'vitest';

import { shouldForwardViewRole } from './orpc-view-role';

describe('platform view-role forwarding', () => {
  it('omits the role cookie throughout the console', () => {
    expect(shouldForwardViewRole('/admin')).toBe(false);
    expect(shouldForwardViewRole('/admin/academies/mapo-dlab/courses')).toBe(
      false,
    );
  });

  it('keeps role diagnostics on academy-owned routes', () => {
    expect(shouldForwardViewRole('/academy/mapo-dlab')).toBe(true);
  });
});
