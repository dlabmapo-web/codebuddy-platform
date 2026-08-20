'use client';

import { pointerIsPlaceable, type CollaborationPointer } from '@cove/shared';
import * as React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import {
  findCanvasElement,
  findSurfaceElement,
  fromCanvasPosition,
  isBoxVisible,
  localPointerSpace,
  pointDirection,
  toViewportPoint,
} from '@/lib/monitoring/awareness/surfaces';

/**
 * What this reader can honestly be shown, in descending order of precision.
 *
 * `arrow` is the exact place. `direction` is exact but off the visible pane,
 * so the reader is told which way rather than having the arrow pinned to an
 * edge. `elsewhere` is everything that cannot be placed at all — the pane is
 * not on this screen, or the position was measured in a space or against a
 * document this reader is not rendering.
 */
type Placement = {
  /** The pointer this measurement belongs to. */
  key: string;
  view:
    | { kind: 'arrow'; left: number; top: number }
    | { kind: 'direction'; direction: 'above' | 'below' }
    | { kind: 'elsewhere' };
};

const placementKey = (pointer: CollaborationPointer) =>
  `${pointer.surface}:${pointer.space}:${pointer.material ?? ''}:${pointer.x}:${pointer.y}`;

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
        setPlacement({ key, view: measure(pointer) });
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

  if (current.view.kind === 'elsewhere') {
    return createPortal(
      <p
        aria-hidden
        data-testid="peer-pointer-elsewhere"
        className="pointer-events-none fixed left-1/2 top-3 z-[95] -translate-x-1/2 rounded-full border border-peer/30 bg-card px-3 py-1 text-[12px] font-semibold text-peer shadow-md"
      >
        {t('peer.looking_at', {
          name,
          surface: t(`peer.surface.${pointer.surface}`),
        })}
      </p>,
      document.body,
    );
  }

  if (current.view.kind === 'direction') {
    const { direction } = current.view;
    // A button, not a label: the position is exact and reachable, so the one
    // useful action is to go there. Keyboard readers get the same offer.
    return createPortal(
      <button
        className={`fixed left-1/2 z-[95] -translate-x-1/2 rounded-full border border-peer/30 bg-card px-3 py-1 text-[12px] font-semibold text-peer shadow-md ${
          direction === 'above' ? 'top-3' : 'bottom-3'
        }`}
        data-testid="peer-pointer-direction"
        onClick={() => scrollPointerIntoView(pointer)}
        type="button"
      >
        <span aria-hidden>{direction === 'above' ? '↑ ' : '↓ '}</span>
        {t(
          direction === 'above' ? 'peer.pointing_above' : 'peer.pointing_below',
          { name },
        )}
      </button>,
      document.body,
    );
  }

  const { left, top } = current.view;

  return createPortal(
    <span
      aria-hidden
      data-peer-surface={pointer.surface}
      data-testid="peer-pointer"
      className="pointer-events-none fixed z-[95] block motion-safe:transition-[left,top] motion-safe:duration-100 motion-safe:ease-linear"
      style={{ left, top }}
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
      <span className="absolute left-[15px] top-4 whitespace-nowrap rounded-[2px_8px_8px_8px] bg-peer px-1.5 py-0.5 text-[11px] font-bold text-on-peer shadow-sm">
        {name}
      </span>
    </span>,
    document.body,
  );
}

/**
 * Where the peer's position lands on this reader's own layout, or why it does
 * not land anywhere.
 *
 * The order matters and is the whole guard. A position is refused before it is
 * measured whenever it was taken in a space this reader is not in, or against a
 * document this reader is not showing — a canvas fraction from one exercise
 * maps perfectly onto another, and drawing it would be a confident lie rather
 * than the diffuse error this design set out to remove.
 */
function measure(pointer: CollaborationPointer): Placement['view'] {
  const surfaceElement = findSurfaceElement(pointer.surface);
  if (!surfaceElement) return { kind: 'elsewhere' };

  if (!pointerIsPlaceable(pointer, localPointerSpace(pointer.surface))) {
    return { kind: 'elsewhere' };
  }

  const surfaceBox = surfaceElement.getBoundingClientRect();
  if (
    !isBoxVisible(surfaceBox, {
      width: window.innerWidth,
      height: window.innerHeight,
    })
  ) {
    return { kind: 'elsewhere' };
  }

  // The canvas when there is one: its box is the box both screens agree on,
  // and because `getBoundingClientRect` reports it after the scale, the scale
  // divides out of the position and multiplies back in here.
  const canvas =
    pointer.space === 'canvas' ? findCanvasElement(pointer.surface) : null;
  const box = canvas ? canvas.getBoundingClientRect() : surfaceBox;
  if (box.width <= 0 || box.height <= 0) return { kind: 'elsewhere' };

  const point = canvas
    ? fromCanvasPosition(pointer, box)
    : toViewportPoint(pointer, box);
  const direction = pointDirection(point, surfaceBox);
  return direction
    ? { kind: 'direction', direction }
    : { kind: 'arrow', ...point };
}

/**
 * Scrolls the peer's position into the reader's pane, on request only.
 *
 * Following is offered, never imposed: a pane that moves itself while someone
 * is reading takes the page away from the person whose screen it is.
 */
function scrollPointerIntoView(pointer: CollaborationPointer): void {
  const surfaceElement = findSurfaceElement(pointer.surface);
  const canvas = findCanvasElement(pointer.surface);
  if (!surfaceElement || !canvas) return;

  const surfaceBox = surfaceElement.getBoundingClientRect();
  const { top } = fromCanvasPosition(pointer, canvas.getBoundingClientRect());
  // Centred rather than flush to the edge: the sentence around the position is
  // what makes it legible, and an edge-aligned target arrives with half of it
  // still off screen.
  surfaceElement.scrollBy({
    behavior: 'smooth',
    top: top - (surfaceBox.top + surfaceBox.height / 2),
  });
}
