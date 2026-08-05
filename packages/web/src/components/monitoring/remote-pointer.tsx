'use client';

import type { CollaborationPointer } from '@cove/shared';
import * as React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import {
  findSurfaceElement,
  isBoxVisible,
  toViewportPoint,
} from '@/lib/monitoring/awareness/surfaces';

type Placement = {
  /** The pointer this measurement belongs to. */
  key: string;
  /** Null when the surface is not on this screen to point at. */
  point: { left: number; top: number } | null;
};

const placementKey = (pointer: CollaborationPointer) =>
  `${pointer.surface}:${pointer.x}:${pointer.y}`;

const noStore = () => () => undefined;

/**
 * False during the server render and the hydration pass, true afterwards.
 *
 * `useSyncExternalStore` rather than a mounted flag in an effect: the server
 * snapshot is part of the render contract, so React never has to reconcile a
 * portal that only one of the two passes produced.
 */
function useHydrated(): boolean {
  return React.useSyncExternalStore(
    noStore,
    () => true,
    () => false,
  );
}

/**
 * The other person's mouse, drawn on this reader's own layout.
 *
 * Rendered into a portal on `document.body` and positioned `fixed`, because
 * the pointer crosses panes: it has to be able to sit over the editor, the
 * problem statement, and the terminal without belonging to any of them or
 * being clipped by their scroll boxes.
 *
 * When the surface the peer is over is not on this screen — a pane scrolled
 * away, collapsed, or absent from this reader's layout entirely — no arrow is
 * drawn. Pinning it to the nearest edge would say "they are pointing here",
 * which is false; naming the pane they are looking at is true and is usually
 * the more useful sentence anyway.
 */
export function RemotePointer({
  name,
  pointer,
}: {
  /** The peer, as this reader is allowed to know them. */
  name: string;
  pointer: CollaborationPointer | null;
}) {
  const { t } = useTranslation('monitoring');
  const [placement, setPlacement] = React.useState<Placement | null>(null);
  const hydrated = useHydrated();

  React.useEffect(() => {
    if (!pointer) return;
    const key = placementKey(pointer);

    let frame = 0;
    const place = () => {
      cancelAnimationFrame(frame);
      // One placement per frame: scroll and resize fire far faster than the
      // screen can show, and `getBoundingClientRect` forces layout.
      frame = requestAnimationFrame(() => {
        const box = findSurfaceElement(pointer.surface)?.getBoundingClientRect();
        const visible =
          box &&
          isBoxVisible(box, {
            width: window.innerWidth,
            height: window.innerHeight,
          });
        setPlacement({
          key,
          point: visible && box ? toViewportPoint(pointer, box) : null,
        });
      });
    };

    place();
    window.addEventListener('resize', place);
    // Capture: the panes scroll, not the window, and a listener on the window
    // alone would never fire for them.
    window.addEventListener('scroll', place, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [pointer]);

  // The portal target only exists in the browser, and a placement is only ever
  // drawn for the pointer it was measured from — which is why nothing has to
  // be cleared when the peer moves: a stale measurement simply stops matching.
  if (!hydrated || !pointer) return null;
  const current =
    placement && placement.key === placementKey(pointer) ? placement : null;
  if (!current) return null;

  if (!current.point) {
    return createPortal(
      <p
        aria-hidden
        data-testid="peer-pointer-elsewhere"
        className="pointer-events-none fixed left-1/2 top-3 z-[95] -translate-x-1/2 rounded-full border border-peer/30 bg-white px-3 py-1 text-[12px] font-semibold text-peer shadow-md"
      >
        {t('peer.looking_at', {
          name,
          surface: t(`peer.surface.${pointer.surface}`),
        })}
      </p>,
      document.body,
    );
  }

  return createPortal(
    <span
      aria-hidden
      data-peer-surface={pointer.surface}
      data-testid="peer-pointer"
      className="pointer-events-none fixed z-[95] block motion-safe:transition-[left,top] motion-safe:duration-100 motion-safe:ease-linear"
      style={{ left: current.point.left, top: current.point.top }}
    >
      <svg
        className="block drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
        fill="none"
        height="20"
        viewBox="0 0 24 24"
        width="20"
      >
        <path
          className="fill-peer"
          d="M4.5 2.5l15 7.2-6.6 1.9-2.1 6.6-6.3-15.7z"
          stroke="white"
          strokeLinejoin="round"
          strokeWidth="1.3"
        />
      </svg>
      <span className="absolute left-[15px] top-4 whitespace-nowrap rounded-[2px_8px_8px_8px] bg-peer px-1.5 py-0.5 text-[11px] font-bold text-white shadow-sm">
        {name}
      </span>
    </span>,
    document.body,
  );
}
