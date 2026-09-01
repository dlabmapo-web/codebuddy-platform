import { permanentRedirect } from 'next/navigation';

/**
 * A retired lens path, forwarded to the one directory.
 *
 * `/admin/users/students`, `/teachers` and `/staff` were three routes onto one
 * table with a role fixed by the path. The table now carries a Role facet
 * instead, so the path's role becomes a query parameter and everything else
 * the address carried travels with it — an operator's bookmark keeps working
 * and lands on the same rows.
 *
 * Permanent, because these paths are not coming back.
 */
export function redirectToDirectory(
  roles: readonly string[],
  params: Record<string, string | string[] | undefined>,
): never {
  const forwarded = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    // The path's own role wins over a hand-edited one, exactly as it did when
    // the path imposed it.
    if (key === 'role') continue;
    if (value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value]) {
      forwarded.append(key, entry);
    }
  }
  for (const role of roles) forwarded.append('role', role);

  const search = forwarded.toString();
  permanentRedirect(search ? `/admin/users?${search}` : '/admin/users');
}
