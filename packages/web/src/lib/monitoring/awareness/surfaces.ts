import {
  isCollaborationSurface,
  normalizeCanvasPosition,
  normalizePointerPosition,
  type CollaborationPointer,
  type CollaborationSurface,
  type PointerSpace,
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
): ResolvedPointerSurface | null {
  if (typeof Element === 'undefined' || !(target instanceof Element)) return null;
  const element = target.closest<HTMLElement>(
    `[${collaborationSurfaceAttribute}]`,
  );
  const surface = element?.getAttribute(collaborationSurfaceAttribute);
  if (!element || !isCollaborationSurface(surface)) return null;
  return { element, surface, canvas: resolvePointerCanvas(target) };
}

export type ResolvedPointerSurface = {
  element: HTMLElement;
  surface: CollaborationSurface;
  /** Null when the point is outside the canvas, or inside an excluded region. */
  canvas: HTMLElement | null;
};

/**
 * The canvas a point is actually inside, by ancestry rather than by lookup.
 *
 * Asking the document for "the statement's canvas" would answer yes for a
 * point that is merely on the same surface — over a dialog above it, say — and
 * a canvas coordinate is only meaningful for something actually laid out in
 * one.
 */
export function resolvePointerCanvas(
  target: EventTarget | null,
): HTMLElement | null {
  if (typeof Element === 'undefined' || !(target instanceof Element)) return null;
  return target.closest<HTMLElement>(`[${collaborationCanvasAttribute}]`);
}

/**
 * Marks the fixed logical canvas a surface renders into while collaborating.
 *
 * Separate from the surface attribute rather than replacing it: the surface is
 * the pane, which scrolls and can be absent from a layout, while the canvas is
 * the content box inside it whose geometry both people agree on. Visibility is
 * still asked of the pane; only the coordinate is taken from the canvas.
 */
export const collaborationCanvasAttribute = 'data-collab-canvas';

/**
 * Which document the canvas is laid out from, carried on the canvas itself.
 *
 * On the element rather than threaded through the monitoring hooks because it
 * is a property of what is rendered, and reading it at measurement time is the
 * only way it cannot disagree with the box it was measured against.
 */
export const collaborationMaterialAttribute = 'data-collab-material';

/** Spread onto the fixed-width element a surface's content renders into. */
export function canvasProps(
  surface: CollaborationSurface,
  material: string,
): Record<string, string> {
  return {
    [collaborationCanvasAttribute]: surface,
    [collaborationMaterialAttribute]: material,
  };
}

/** Null whenever this screen is not currently drawing that surface on a canvas. */
export function findCanvasElement(
  surface: CollaborationSurface,
): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector<HTMLElement>(
    `[${collaborationCanvasAttribute}="${surface}"]`,
  );
}

/** The space and material this reader is currently drawing a surface in. */
export function localPointerSpace(surface: CollaborationSurface): {
  space: PointerSpace;
  material: string | null;
} {
  const canvas = findCanvasElement(surface);
  return canvas
    ? {
        space: 'canvas',
        material: canvas.getAttribute(collaborationMaterialAttribute),
      }
    : { space: 'surface', material: null };
}

/**
 * The box a position for this surface is measured against, and which space
 * that box is in.
 *
 * The canvas wins when present. Its `getBoundingClientRect` reports the
 * *transformed* box, so the scale divides out of the fraction on the way in
 * and multiplies back in on the way out — neither side ever needs to know the
 * other's window size, pane width, or zoom, and none of it reaches the wire.
 */
export function pointerBoxFor(resolved: ResolvedPointerSurface): {
  box: DOMRect;
  space: PointerSpace;
  material: string | null;
} {
  return resolved.canvas
    ? {
        box: resolved.canvas.getBoundingClientRect(),
        space: 'canvas',
        material: resolved.canvas.getAttribute(collaborationMaterialAttribute),
      }
    : {
        box: resolved.element.getBoundingClientRect(),
        space: 'surface',
        material: null,
      };
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

/**
 * A point inside the canvas, in canvas widths on both axes.
 *
 * Both are divided by the *width* on purpose. The width is fixed and identical
 * on both screens; the height is not, because the two people can be rendering
 * statements of different lengths. Dividing `y` by the height is what made the
 * arrow drift further down the page the longer the statement was.
 */
export function toCanvasPosition(
  point: { clientX: number; clientY: number },
  box: Box,
): { x: number; y: number } | null {
  if (box.width <= 0) return null;
  return normalizeCanvasPosition({
    x: (point.clientX - box.left) / box.width,
    y: (point.clientY - box.top) / box.width,
  });
}

/** The reverse, in the same units. */
export function fromCanvasPosition(
  pointer: Pick<CollaborationPointer, 'x' | 'y'>,
  box: Box,
): { left: number; top: number } {
  return {
    left: box.left + pointer.x * box.width,
    top: box.top + pointer.y * box.width,
  };
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


/**
 * Which way a placed point lies from the pane the reader can actually see.
 *
 * A canvas coordinate stays exact when the reader has scrolled elsewhere, so
 * position and visibility are different questions. Null means it is inside the
 * pane and the arrow itself can be drawn; otherwise the caller says which way
 * to look rather than pinning an arrow to an edge.
 */
export function pointDirection(
  point: { left: number; top: number },
  surfaceBox: Box,
): 'above' | 'below' | null {
  if (point.top < surfaceBox.top) return 'above';
  if (point.top > surfaceBox.top + surfaceBox.height) return 'below';
  return null;
}
