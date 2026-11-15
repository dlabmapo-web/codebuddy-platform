'use client';
import { useHistoryCovered } from '@/lib/monitoring/history-presentation';

import { pointerIsPlaceable, type CollaborationPointer } from '@cove/shared';
import * as React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { codeGeometryEvent, projectCodePointer } from '@/lib/monitoring/awareness/code-pointer';
import {
  canvasLayoutReady,
  findAnchorElement,
  findCanvasElement,
  findSurfaceElement,
  fromAnchorPosition,
  fromCanvasPosition,
  isBoxVisible,
  localPointerSpace,
  pointDirection,
  toViewportPoint,
  visibleBoxWithin,
} from '@/lib/monitoring/awareness/surfaces';

/**
 * What this reader can honestly be shown, in descending order of precision.
 *
 * `arrow` is the exact place. `direction` is exact but off the visible pane,
 * so the reader is told which way rather than having the arrow pinned to an
 * edge. `elsewhere` names an unavailable position on a verified matching
 * material. Other materials are hidden before this component mounts.
 */
type Placement = {
  /** The context in which this placement is safe to retain before measurement. */
  key: string;
  view:
    | { kind: 'arrow'; left: number; top: number }
    | { kind: 'direction'; direction: 'above' | 'below' }
    | { kind: 'elsewhere' };
};

const placementContext = (pointer: CollaborationPointer, projectionContext?: string | null) =>
  JSON.stringify([pointer.surface, pointer.space, pointer.material, pointer.code?.draftId, projectionContext]);

function samePlacement(previous: Placement | null, next: Placement): boolean {
  if (!previous || previous.key !== next.key || previous.view.kind !== next.view.kind) return false;
  if (previous.view.kind === 'arrow' && next.view.kind === 'arrow') {
    return previous.view.left === next.view.left && previous.view.top === next.view.top;
  }
  return previous.view.kind !== 'direction' ||
    (next.view.kind === 'direction' && previous.view.direction === next.view.direction);
}

// Body/ancestor observation must not react to the overlay's own insertion,
// removal or movement, including another peer's marker.
function isOverlayNode(node: Node): boolean {
  const element = node instanceof Element ? node : node.parentElement;
  return !!element?.closest('[data-peer-pointer-overlay]');
}

function changesGeometry(mutation: MutationRecord): boolean {
  if (isOverlayNode(mutation.target)) return false;
  return mutation.type !== 'childList' ||
    [...mutation.addedNodes, ...mutation.removedNodes].some(node => !isOverlayNode(node));
}

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
function RemotePointerContent({
  name,
  pointer,
  position,
  project,
  projectionContext,
}: {
  /** The peer, as this reader is allowed to know them. */
  name: string;
  pointer: CollaborationPointer | null;
  /** A snapshot editor projects its own model; the marker presentation is shared. */
  position?: { left: number; top: number } | null;
  project?: () => { left: number; top: number } | null;
  /** Snapshot file identity; coordinates and content revisions can change within it. */
  projectionContext?: string | null;
}) {
  const { t } = useTranslation('monitoring');
  const [placement, setPlacement] = React.useState<Placement | null>(null);
  const hydrated = useHydrated();
  const latest = React.useRef({ pointer, position, project, projectionContext });
  const context = pointer ? placementContext(pointer, projectionContext) : null;
  const anchored = !!pointer?.anchor;

  const measureLatest = React.useCallback(() => {
    const { pointer: current, position: point, project: projectPoint, projectionContext: scope } = latest.current;
    if (!current) return;
    const projected = projectPoint ? projectPoint() : point;
    const next: Placement = {
      key: placementContext(current, scope),
      view: projected === undefined ? measure(current)
        : projected ? { kind: 'arrow', ...projected } : { kind: 'elsewhere' },
    };
    setPlacement(previous => samePlacement(previous, next) ? previous : next);
  }, []);

  // Keep the eligible arrow in the tree while coordinates change, then commit
  // the validated new projection before paint. A passive effect plus RAF left
  // a painted blank frame and recreated the arrow on every movement packet.
  React.useLayoutEffect(() => {
    latest.current = { pointer, position, project, projectionContext };
    measureLatest();
  }, [pointer, position, project, projectionContext, measureLatest]);

  React.useLayoutEffect(() => {
    if (!context) return;
    let frame = 0;
    let disposed = false;
    let surface: HTMLElement | null | undefined;
    let canvas: HTMLElement | null | undefined;
    const place = () => {
      // One placement per frame: scroll and resize fire far faster than the
      // screen can show. Read committed inputs, never a queued old packet.
      if (frame || disposed) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (disposed) return;
        observeTargets();
        measureLatest();
      });
    };
    const mutations = typeof MutationObserver === 'undefined' ? null : new MutationObserver(records => {
      if (records.some(changesGeometry)) place();
    });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    const observeTargets = () => {
      const current = latest.current.pointer;
      if (!current) return;
      const nextSurface = findSurfaceElement(current.surface);
      const nextCanvas = findCanvasElement(current.surface);
      if (surface === nextSurface && canvas === nextCanvas) return;
      surface = nextSurface; canvas = nextCanvas;
      observer?.disconnect(); mutations?.disconnect();
      // Ancestors cover sibling-driven movement and surface replacement.
      let element: HTMLElement | null = canvas ?? surface;
      if (!element) {
        // A PDF/player may mount after its first awareness frame arrives.
        mutations?.observe(document.body, { childList: true, subtree: true });
        observer?.observe(document.body);
      }
      while (element) {
        observer?.observe(element);
        mutations?.observe(element, { attributes: true, attributeFilter: ['class', 'style'], childList: true });
        element = element.parentElement;
      }
      if (anchored && surface) {
        mutations?.observe(surface, { attributes: true, attributeFilter: ['class', 'style', 'data-state'], childList: true, subtree: true });
      }
    };
    observeTargets();
    window.addEventListener(codeGeometryEvent, place);
    window.addEventListener('resize', place);
    // Capture: the panes scroll, not the window, and a listener on the window
    // alone would never fire for them.
    window.addEventListener('scroll', place, true);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      mutations?.disconnect();
      window.removeEventListener(codeGeometryEvent, place);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [context, anchored, measureLatest]);

  // Context changes and explicit clears still suppress stale presentation in
  // render. Coordinates alone do not remove the portal between measurements.
  if (!hydrated || !pointer) return null;
  const current =
    placement && placement.key === context ? placement : null;
  if (!current) return null;

  if (current.view.kind === 'elsewhere') {
    return createPortal(
      <p
        aria-hidden
        data-peer-pointer-overlay
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
        data-peer-pointer-overlay
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
      data-peer-pointer-overlay
      data-peer-surface={pointer.surface}
      data-testid="peer-pointer"
      className="pointer-events-none fixed z-[95] block motion-safe:transition-[left,top] motion-safe:duration-100 motion-safe:ease-linear"
      style={{ left: left - 4.5 * (20 / 24), top: top - 2.5 * (20 / 24) }}
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
  if (pointer.surface === 'editor') {
    const point = projectCodePointer(pointer);
    return point ? { kind: 'arrow', ...point } : { kind: 'elsewhere' };
  }
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
  if (canvas && !canvasLayoutReady(canvas)) return { kind: 'elsewhere' };
  const box = canvas ? canvas.getBoundingClientRect() : surfaceBox;
  if (box.width <= 0 || box.height <= 0) return { kind: 'elsewhere' };

  // The anchored row wins when the sender named one: a pane fraction is a
  // different row on a pane of a different height. A named row this screen
  // is not showing (a collapsed chapter, a line not yet received) has no
  // truthful placement, so the pane is named instead.
  if (!canvas && pointer.anchor) {
    const anchorElement = findAnchorElement(surfaceElement, pointer.anchor.key);
    if (!anchorElement) return { kind: 'elsewhere' };
    const anchorBox = anchorElement.getBoundingClientRect();
    if (anchorBox.width <= 0 || anchorBox.height <= 0) return { kind: 'elsewhere' };
    const anchored = fromAnchorPosition(pointer.anchor, anchorBox);
    const anchoredDirection = pointDirection(
      anchored,
      visibleBoxWithin(anchorElement, surfaceElement),
    );
    return anchoredDirection
      ? { kind: 'direction', direction: anchoredDirection }
      : { kind: 'arrow', ...anchored };
  }

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

export function RemotePointer({
  materialId,
  sourceMaterialId,
  ...props
}: React.ComponentProps<typeof RemotePointerContent> & {
  /** The content actually rendered, including an independent preview. */
  materialId: string | null;
  /** Material established by the accepted watch/session or awareness envelope. */
  sourceMaterialId: string | null;
}) {
  const covered = useHistoryCovered();
  // Eligibility precedes geometry: a failed projection on another lesson must
  // not become a "looking at code" banner. Unmounting also cancels old frames
  // and observers immediately when the displayed content changes.
  if (covered || !materialId || materialId !== sourceMaterialId ||
    (props.pointer?.material != null && props.pointer.material !== sourceMaterialId)) return null;
  return <RemotePointerContent key={materialId} {...props} />;
}
