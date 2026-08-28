import { notFound } from 'next/navigation';

import { getAccount } from '@/lib/orpc-server';

/**
 * The platform console's boundary.
 *
 * `notFound()` rather than a redirect or a 403 page: a non-admin should not
 * learn that this surface exists. It is the same reticence the API shows by
 * answering `PLATFORM_ACCESS_DENIED` instead of the `PERMISSION_DENIED` any
 * academy member can already provoke — one code for "you were refused",
 * another for "you were somewhere you have no business knowing about".
 *
 * The API is the real boundary and every handler under this route re-checks.
 * This exists so a non-admin never sees a shell flash before an empty page.
 */
export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Resolved outside any try/catch that could swallow it: `notFound()` works by
  // throwing, so calling it inside the catch below would be caught by the very
  // handler meant to fail closed.
  const isPlatformAdmin = await readPlatformRole();
  if (!isPlatformAdmin) notFound();

  return children;
}

async function readPlatformRole(): Promise<boolean> {
  try {
    // `getAccount` reads the session itself and throws when there is none, so
    // an absent session lands in the same `catch` an unreachable API does —
    // which is the answer this function wants for both.
    const account = await getAccount();
    return account.user.platformRole === 'ADMIN';
  } catch {
    // A failed lookup is not permission. This is the one surface where an
    // outage must not fail open.
    return false;
  }
}
