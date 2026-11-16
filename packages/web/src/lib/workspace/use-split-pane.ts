'use client';

import * as React from 'react';

/** Editor space a vertical drag always leaves behind. */
const MIN_OPPOSITE_PX = 120;

/**
 * A draggable divider between two panes.
 *
 * Pointer capture lives on the divider rather than window listeners, so a fast
 * drag that outruns the cursor still delivers moves here instead of being
 * swallowed by the Monaco surface underneath.
 */
export function useSplitPane({
  axis,
  initial,
  min,
  minPx,
  max,
  storageKey,
}: {
  storageKey?: string;
  axis: 'horizontal' | 'vertical';
  /** Percent for horizontal, pixels for vertical. */
  initial: number;
  min: number;
  /**
   * A floor in pixels, for a horizontal pane whose content cannot honestly
   * render below a width — the statement canvas, whose scale is clamped and
   * whose pane must not be draggable narrower than that clamp can represent.
   *
   * Applied on top of `min` rather than instead of it, and re-applied when it
   * appears: a pane already dragged below the floor when collaboration begins
   * has to widen, not stay narrow until the next drag.
   */
  minPx?: number;
  max: number;
}) {
  const [size, setSize] = React.useState(initial);
  // Only a resize the user made is saved. Saving on mount would overwrite the
  // stored size with the default before the stored value has been applied.
  const resized = React.useRef(false);
  React.useEffect(() => {
    if (!storageKey) return;
    // The stored size is read after mount so the server and first client
    // render agree on the default; the frame keeps the update out of the
    // effect body.
    const frame = requestAnimationFrame(() => {
      try { const stored = localStorage.getItem(storageKey); const value = Number(stored); if (stored && Number.isFinite(value)) setSize(Math.max(min, Math.min(max, value))); } catch { /* Browser storage is optional. */ }
    });
    return () => cancelAnimationFrame(frame);
  }, [storageKey, min, max]);
  React.useEffect(() => { if (storageKey && resized.current) { try { localStorage.setItem(storageKey, String(size)); } catch { /* Browser storage is optional. */ } } }, [size, storageKey]);
  const [dragging, setDragging] = React.useState(false);
  // Pointer movement can arrive before React commits the visual dragging
  // state. A ref becomes true synchronously on pointer-down, so the first few
  // pixels of a quick drag are never discarded.
  const draggingRef = React.useRef(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const onPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      draggingRef.current = true;
      setDragging(true);
    },
    [],
  );

  const onPointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();

      const next =
        axis === 'horizontal'
          ? ((event.clientX - rect.left) / rect.width) * 100
          : rect.bottom - event.clientY;

      // The vertical pane is sized in pixels against a container whose height
      // varies with the viewport, so a fixed `max` would either cap the drag
      // short on a tall screen or let the terminal swallow the editor on a
      // short one. Reserving room for the editor keeps both usable.
      const ceiling =
        axis === 'vertical'
          ? Math.min(max, Math.max(min, rect.height - MIN_OPPOSITE_PX))
          : max;

      const floor =
        axis === 'horizontal' && minPx && rect.width > 0
          ? Math.max(min, Math.min(max, (minPx / rect.width) * 100))
          : min;

      resized.current = true;
      setSize(Math.max(floor, Math.min(ceiling, next)));
    },
    [axis, max, min, minPx],
  );

  /**
   * Re-applies the pixel floor when it appears or the container changes width.
   *
   * Without this, entering collaboration would leave a pane that was already
   * narrower than the floor exactly where it was, and only a drag would ever
   * correct it.
   */
  React.useEffect(() => {
    if (axis !== 'horizontal' || !minPx) return;
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;

    const apply = () => {
      const width = container.clientWidth;
      if (width <= 0) return;
      const floor = Math.max(min, Math.min(max, (minPx / width) * 100));
      setSize((current) => (current < floor ? floor : current));
    };

    const observer = new ResizeObserver(apply);
    observer.observe(container);
    apply();
    return () => observer.disconnect();
  }, [axis, max, min, minPx]);

  const finishDragging = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      draggingRef.current = false;
      setDragging(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [],
  );

  const onLostPointerCapture = React.useCallback(() => {
    draggingRef.current = false;
    setDragging(false);
  }, []);

  return {
    size,
    /** Keyboard adjustment uses the same bounds as pointer resizing. */
    resizeBy(delta: number) {
      const rect = containerRef.current?.getBoundingClientRect();
      const ceiling = axis === 'vertical' && rect
        ? Math.min(max, Math.max(min, rect.height - MIN_OPPOSITE_PX)) : max;
      const floor = axis === 'horizontal' && minPx && rect?.width
        ? Math.max(min, Math.min(max, (minPx / rect.width) * 100)) : min;
      resized.current = true;
      setSize(current => Math.max(floor, Math.min(ceiling, current + delta)));
    },
    dragging,
    containerRef,
    dividerProps: {
      onLostPointerCapture,
      onPointerCancel: finishDragging,
      onPointerDown,
      onPointerMove,
      onPointerUp: finishDragging,
    },
  };
}
