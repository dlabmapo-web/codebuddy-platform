import {
  isCollaborationSurface,
  normalizePointerPosition,
  type CollaborationPointer,
  type CollaborationSurface,
} from '@cove/shared';

/**
 * Where a pointer is, expressed as a place rather than a coordinate.
 *
 * Two people share this workspace on different screens, at different widths,
 * with panes dragged to different sizes. A viewport coordinate from one of
 * them means nothing on the other's display, so a position is always a named
 * surface plus a fraction of that surface's own box — which is also why the
 * payload is incapable of carrying anything about the sender's screen beyond
 * the pane their mouse is over.
 *
 * Surfaces are declared with a DOM attribute rather than a React context so a
 * single document-level listener can resolve any of them with `closest`. The
 * student's workspace is the ordinary one every student uses; it must not have
 * to wrap every pane in a collaboration component to be watchable.
 */

export const collaborationSurfaceAttribute = 'data-collab-surface';

/** Spread onto the element that owns a surface. */
export function surfaceProps(
  surface: CollaborationSurface,
): Record<string, string> {
  return { [collaborationSurfaceAttribute]: surface };
}

export function resolvePointerSurface(
  target: EventTarget | null,
): { element: HTMLElement; surface: CollaborationSurface } | null {
  if (typeof Element === 'undefined' || !(target instanceof Element)) return null;
  const element = target.closest<HTMLElement>(
    `[${collaborationSurfaceAttribute}]`,
  );
  const surface = element?.getAttribute(collaborationSurfaceAttribute);
  if (!element || !isCollaborationSurface(surface)) return null;
  return { element, surface };
}

export function findSurfaceElement(
  surface: CollaborationSurface,
): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector<HTMLElement>(
    `[${collaborationSurfaceAttribute}="${surface}"]`,
  );
}

export type Box = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;

/** A point inside a box, as the fraction of the box it sits at. */
export function toSurfaceFraction(
  point: { clientX: number; clientY: number },
  box: Box,
): { x: number; y: number } | null {
  if (box.width <= 0 || box.height <= 0) return null;
  return normalizePointerPosition({
    x: (point.clientX - box.left) / box.width,
    y: (point.clientY - box.top) / box.height,
  });
}

/** The reverse: where the peer's fraction lands on this reader's screen. */
export function toViewportPoint(
  pointer: Pick<CollaborationPointer, 'x' | 'y'>,
  box: Box,
): { left: number; top: number } {
  return {
    left: box.left + pointer.x * box.width,
    top: box.top + pointer.y * box.height,
  };
}

/**
 * Whether a surface is worth drawing a pointer on.
 *
 * A collapsed pane, one scrolled out of view, or one this reader's layout does
 * not render at all would otherwise pin the peer's cursor to an arbitrary
 * screen edge, which reads as "they are pointing there" — a lie. The caller
 * shows the surface by name instead.
 */
export function isBoxVisible(
  box: Box,
  viewport: { width: number; height: number },
): boolean {
  return (
    box.width > 0 &&
    box.height > 0 &&
    box.top < viewport.height &&
    box.left < viewport.width &&
    box.top + box.height > 0 &&
    box.left + box.width > 0
  );
}
