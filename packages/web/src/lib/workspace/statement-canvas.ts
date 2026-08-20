'use client';

import * as React from 'react';

/**
 * The logical width the statement lays out at while collaborating.
 *
 * Chosen to match what students already read at rather than as a round number:
 * v1 shipped the statement pane at 42–46% of the window and v2 kept 46%, which
 * is roughly 620px on a 1440 screen. Laying out at 640 puts canvas mode near
 * scale 1 in the default layout, so entering a session barely disturbs the
 * page.
 */
export const STATEMENT_CANVAS_WIDTH = 640;

/**
 * How far the canvas may be scaled before the text stops being worth reading.
 *
 * The floor is what makes the minimum pane width below meaningful; the ceiling
 * stops a wide pane from rendering absurdly large type, after which the canvas
 * is centred instead of grown.
 */
export const STATEMENT_CANVAS_MIN_SCALE = 0.7;
export const STATEMENT_CANVAS_MAX_SCALE = 1.4;

/**
 * The one description of how wide the statement pane is, for both roles.
 *
 * The student and the teacher lay their workspaces out differently — a
 * two-pane split against a three-pane one — but the statement itself is the
 * surface they share, and a pointer is only a shared coordinate if both of
 * them are reading the same column. Kept here rather than at the two call
 * sites for the same reason `navigator-geometry` keeps the panel's: a change
 * to one role's number that misses the other is exactly the class of drift
 * this whole design exists to remove.
 */
export const STATEMENT_PANE = {
  /** Percent of the pane row given to the statement before any drag. */
  initialPercent: 46,
  minPercent: 28,
  maxPercent: 68,
} as const;

/** The narrowest the statement pane may be dragged while collaborating. */
export const STATEMENT_CANVAS_MIN_WIDTH =
  STATEMENT_CANVAS_WIDTH * STATEMENT_CANVAS_MIN_SCALE;

/**
 * The scale that fits the canvas into a pane.
 *
 * Both people may compute a different one, and that is the point: the scale is
 * applied identically to the content and to the pointer, so it divides out of
 * every shared coordinate. Neither side needs the other's number.
 */
export function statementCanvasScale(paneWidth: number): number {
  if (!Number.isFinite(paneWidth) || paneWidth <= 0) return 1;
  return Math.min(
    STATEMENT_CANVAS_MAX_SCALE,
    Math.max(STATEMENT_CANVAS_MIN_SCALE, paneWidth / STATEMENT_CANVAS_WIDTH),
  );
}

export type StatementCanvasMeasurement = {
  /** Width of the pane the canvas is being fitted into. */
  paneWidth: number;
  /** Unscaled height of the laid-out content. */
  contentHeight: number;
};

/**
 * Measures the pane and the canvas content, and decides whether to engage.
 *
 * Two observers rather than one: the pane's width drives the scale, while the
 * content's height is a consequence of the *logical* width and so cannot be
 * read from the same box. Reading the content height from the transformed box
 * would feed the scale back into itself.
 *
 * `engaged` is not the same as `active`. A pane narrower than the canvas can
 * honestly represent — a phone, or a layout with no split pane to clamp — stays
 * in ordinary reflowing space, and the position's `space` field is what keeps
 * the peer from drawing a canvas coordinate against it.
 */
export function useStatementCanvas(active: boolean): {
  paneRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  engaged: boolean;
  scale: number;
  contentHeight: number;
} {
  const paneRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLDivElement>(null);
  const [measurement, setMeasurement] =
    React.useState<StatementCanvasMeasurement>({
      paneWidth: 0,
      contentHeight: 0,
    });

  const engaged = active && measurement.paneWidth >= STATEMENT_CANVAS_MIN_WIDTH;

  React.useEffect(() => {
    // No reset on the way out: `engaged` already requires `active`, so a stale
    // measurement changes nothing while collaboration is off, and keeping it
    // means re-entering a session does not flash through an unscaled frame
    // before the first observation lands.
    if (!active) return;
    const pane = paneRef.current;
    if (!pane || typeof ResizeObserver === 'undefined') return;

    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      // One measurement per frame: both observers fire during the same layout
      // pass on entry, and `offsetHeight` forces one of its own.
      frame = requestAnimationFrame(() => {
        setMeasurement((current) => {
          const paneWidth = pane.clientWidth;
          const contentHeight =
            canvasRef.current?.offsetHeight ?? current.contentHeight;
          if (
            current.paneWidth === paneWidth &&
            current.contentHeight === contentHeight
          ) {
            return current;
          }
          return { paneWidth, contentHeight };
        });
      });
    };

    const observer = new ResizeObserver(measure);
    observer.observe(pane);
    if (canvasRef.current) observer.observe(canvasRef.current);
    measure();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
    // `engaged` re-runs this so the canvas is observed from the render that
    // first creates it, rather than a resize later.
  }, [active, engaged]);

  return {
    paneRef,
    canvasRef,
    engaged,
    scale: engaged ? statementCanvasScale(measurement.paneWidth) : 1,
    contentHeight: measurement.contentHeight,
  };
}
