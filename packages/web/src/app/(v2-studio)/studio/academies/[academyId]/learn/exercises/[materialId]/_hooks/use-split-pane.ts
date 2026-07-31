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
  max,
}: {
  axis: 'horizontal' | 'vertical';
  /** Percent for horizontal, pixels for vertical. */
  initial: number;
  min: number;
  max: number;
}) {
  const [size, setSize] = React.useState(initial);
  const [dragging, setDragging] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const onPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    },
    [],
  );

  const onPointerMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
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

      setSize(Math.max(min, Math.min(ceiling, next)));
    },
    [axis, dragging, max, min],
  );

  const onPointerUp = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.currentTarget.releasePointerCapture(event.pointerId);
      setDragging(false);
    },
    [],
  );

  return {
    size,
    dragging,
    containerRef,
    dividerProps: { onPointerDown, onPointerMove, onPointerUp },
  };
}
