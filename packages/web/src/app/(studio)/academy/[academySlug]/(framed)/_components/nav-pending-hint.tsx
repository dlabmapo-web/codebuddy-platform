'use client';

import { useLinkStatus } from 'next/link';

/**
 * A dot on the nav item that was clicked, while its destination is on the wire.
 *
 * `useLinkStatus` only reports for the `<Link>` it sits inside, which is the
 * whole point: it names *which* destination is loading, where a bar across the
 * top of the page could only say that something is. It is also the last
 * resort rather than the first — the route skeletons make most navigations
 * instant, and Next's own guidance is to reach for this only for the
 * transitions that stay slow after that.
 *
 * `aria-hidden` because there is nothing here to read. The destination's own
 * `loading.tsx` announces itself through its status region, and a screen
 * reader hearing about both would be told twice that one thing is happening.
 *
 * The element is always rendered and never changes size — only its opacity
 * moves — so an appearing dot cannot nudge the label beside it. See
 * `.cove-link-hint` in `globals.css` for the delay that keeps a fast
 * navigation from flashing it.
 */
export function NavPendingHint() {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden
      className="cove-link-hint ml-auto"
      data-pending={pending}
    />
  );
}
