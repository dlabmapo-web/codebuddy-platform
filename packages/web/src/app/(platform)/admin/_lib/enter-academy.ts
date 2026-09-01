'use client';

import type { PlatformViewRole } from '@cove/shared';

/**
 * Walk into an academy, standing in one of its roles.
 *
 * The console never edits an academy's curriculum itself — it takes the
 * operator to the academy's own screens, which is where every mutation already
 * lives. So "Add a course" from here is not a second course form; it is the
 * Team Lead's form, opened by somebody standing as a Team Lead.
 *
 * The role rides a cookie because every request the studio makes has to carry
 * it — the server render, and every refetch the browser does afterwards. A
 * query parameter would survive exactly one navigation, and the second answer
 * would come back for a different role than the first.
 */
export function enterAcademyAs(role: PlatformViewRole, path: string): void {
  document.cookie = `cove_view_role=${role}; path=/; max-age=86400; samesite=lax`;
  // A full load rather than a client navigation: the cookie has to be on the
  // request that renders the destination, and a soft push would send the old
  // one — landing the operator in the role they were in a moment ago.
  window.location.assign(path);
}
