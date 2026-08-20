import { isCollaborationSurface, type CollaborationSurface } from '@cove/shared';

import {
  collaborationSurfaceAttribute,
  resolvePointerCanvas,
  type Box,
} from './surfaces';

export type PointerCaptureSurface = {
  element: HTMLElement;
  surface: CollaborationSurface;
  /**
   * Resolved from the frame, not from the point inside it: events do not cross
   * the document boundary, so the inner target has no view of the canvas its
   * frame is laid out in.
   */
  canvas: HTMLElement | null;
};

export type PointerViewportPoint = { clientX: number; clientY: number };

/** Generic bridge emitted by `RichTextFrame` from its loaded inner document. */
export const iframePointerMoveEvent = 'cove:iframe-pointer-move';

/**
 * Maps an iframe-local pointer into the viewport shared with its frame.
 *
 * The inner document reports coordinates in its own, untransformed space,
 * while the frame's box is reported after any transform an ancestor applies.
 * Inside the statement canvas that transform is a scale, and adding logical
 * pixels to a scaled origin is wrong by exactly that factor. `scale` divides
 * it back out, and is 1 wherever nothing is scaled — every surface but this
 * one.
 */
export function iframePointToViewport(
  point: PointerViewportPoint,
  frameBox: Box,
  scale = 1,
): PointerViewportPoint {
  return {
    clientX: frameBox.left + point.clientX * scale,
    clientY: frameBox.top + point.clientY * scale,
  };
}

/**
 * The scale an ancestor is applying to a frame, read from the element itself.
 *
 * Derived from the two boxes rather than threaded down from React: the
 * transform belongs to a component that knows nothing about monitoring, and a
 * number passed through the tree would be one render stale during a drag.
 */
export function frameScale(frame: HTMLIFrameElement, frameBox: Box): number {
  const logical = frame.offsetWidth;
  if (logical <= 0 || frameBox.width <= 0) return 1;
  return frameBox.width / logical;
}

function frameSurface(frame: HTMLIFrameElement): PointerCaptureSurface | null {
  const element = frame.closest<HTMLElement>(
    `[${collaborationSurfaceAttribute}]`,
  );
  const surface = element?.getAttribute(collaborationSurfaceAttribute);
  if (!element || !isCollaborationSurface(surface)) return null;
  return { element, surface, canvas: resolvePointerCanvas(frame) };
}

/**
 * Captures pointer movement inside same-origin workspace frames.
 *
 * Events never cross a document boundary. V2's authored exercise HTML lives
 * in a sandboxed `srcDoc` frame, so a listener on the workspace document sees
 * the pointer reach the iframe element and then goes silent over most of the
 * problem statement. This observer attaches to that inner document while
 * keeping all monitoring knowledge out of the reusable rich-text component.
 */
export function observeSurfaceIframes({
  onLeave,
  onPointerMove,
  root = document,
}: {
  onLeave: () => void;
  onPointerMove: (
    point: PointerViewportPoint,
    resolved: PointerCaptureSurface,
  ) => void;
  root?: Document;
}): () => void {
  type AttachedFrame = {
    detach: () => void;
    refresh: () => void;
  };

  const attached = new Map<HTMLIFrameElement, AttachedFrame>();

  const bridgedMove = (event: Event) => {
    if (!(event instanceof CustomEvent)) return;
    const frame = event.target;
    if (!(frame instanceof HTMLIFrameElement)) return;
    const detail = event.detail as Partial<PointerViewportPoint> | null;
    if (
      !detail ||
      typeof detail.clientX !== 'number' ||
      typeof detail.clientY !== 'number'
    ) {
      return;
    }
    const resolved = frameSurface(frame);
    if (!resolved) return;
    const frameBox = frame.getBoundingClientRect();
    onPointerMove(
      iframePointToViewport(
        { clientX: detail.clientX, clientY: detail.clientY },
        frameBox,
        frameScale(frame, frameBox),
      ),
      resolved,
    );
  };

  root.addEventListener(iframePointerMoveEvent, bridgedMove, true);

  const attach = (frame: HTMLIFrameElement) => {
    if (attached.has(frame)) return;

    let detachDocument: () => void = () => undefined;

    const refresh = () => {
      detachDocument();
      detachDocument = () => undefined;

      let frameDocument: Document | null = null;
      try {
        frameDocument = frame.contentDocument;
      } catch {
        // Cross-origin frames are outside the Cove collaboration surface. The
        // parent document listener keeps working even when one is present.
        return;
      }
      if (!frameDocument) return;

      const move = (event: MouseEvent) => {
        const resolved = frameSurface(frame);
        if (!resolved) return;
        const frameBox = frame.getBoundingClientRect();
        onPointerMove(
          iframePointToViewport(event, frameBox, frameScale(frame, frameBox)),
          resolved,
        );
      };
      frameDocument.addEventListener('pointermove', move, true);
      // WebKit does not consistently surface Pointer Events from a sandboxed
      // srcDoc document to listeners installed by its parent. Mouse Events do
      // arrive. Chromium emits both; the awareness throttle coalesces them.
      frameDocument.addEventListener('mousemove', move, true);
      detachDocument = () => {
        frameDocument?.removeEventListener('pointermove', move, true);
        frameDocument?.removeEventListener('mousemove', move, true);
      };
    };

    const leave = (event: MouseEvent) => {
      const current = frameSurface(frame);
      const related =
        event.relatedTarget instanceof Element
          ? event.relatedTarget.closest<HTMLElement>(
              `[${collaborationSurfaceAttribute}]`,
            )
          : null;
      // Crossing from the frame into the rest of the same statement is still
      // movement on one semantic surface; the parent listener takes over.
      if (current && related === current.element) return;
      onLeave();
    };

    frame.addEventListener('load', refresh);
    frame.addEventListener('pointerleave', leave);
    frame.addEventListener('mouseleave', leave);
    const record: AttachedFrame = {
      refresh,
      detach: () => {
        detachDocument();
        frame.removeEventListener('load', refresh);
        frame.removeEventListener('pointerleave', leave);
        frame.removeEventListener('mouseleave', leave);
      },
    };
    attached.set(frame, record);
    refresh();
  };

  const scan = () => {
    const live = new Set(
      Array.from(root.querySelectorAll<HTMLIFrameElement>('iframe')).filter(
        (frame) => frameSurface(frame) !== null,
      ),
    );
    for (const frame of live) attach(frame);
    for (const [frame, record] of attached) {
      if (live.has(frame)) continue;
      record.detach();
      attached.delete(frame);
    }
  };

  scan();
  const observer = new MutationObserver(scan);
  if (root.documentElement) {
    observer.observe(root.documentElement, { childList: true, subtree: true });
  }

  return () => {
    observer.disconnect();
    root.removeEventListener(iframePointerMoveEvent, bridgedMove, true);
    for (const record of attached.values()) record.detach();
    attached.clear();
  };
}
