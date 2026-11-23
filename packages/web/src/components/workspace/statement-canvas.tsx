'use client';

import type { CollaborationSurface } from '@cove/shared';
import * as React from 'react';

import { canvasProps } from '@/lib/monitoring/awareness/surfaces';
import { useStatementCanvas } from '@/lib/workspace/statement-canvas';

/**
 * The statement, as a box both people's pointers can share.
 *
 * A pointer shared between two people has to be a fraction of a box that means
 * the same thing on both screens. A scrolling, reflowing pane is not that box
 * on its own: the same fraction lands on different text when the panes differ
 * in width or scroll position.
 *
 * The student's own layout is the shared box. Being watched must not change
 * what a student sees (QA S-10: a fixed 640px canvas scaled to fit shrank their
 * text the moment a teacher joined), so on the student's screen the canvas is
 * simply their statement, untouched, and its width is reported so the watcher
 * can copy it. A teacher passes that width as `logicalWidth`, lays the
 * statement out at exactly that width and scales it to their own pane: same
 * line breaks, so a fraction of the width lands on the same word.
 *
 * Only while collaborating. Outside a session nobody needs the box.
 */
export function StatementCanvas({
  active,
  children,
  logicalWidth = null,
  material,
  onReadingWidth,
  surface,
}: {
  /** True only while a shared document exists. */
  active: boolean;
  children: React.ReactNode;
  /**
   * The student's statement width, on a screen mirroring it. Null on the
   * student's own screen.
   */
  logicalWidth?: number | null;
  /**
   * The document this layout comes from, published with every position taken
   * against it so a peer rendering something else refuses it rather than
   * drawing an exact arrow on unrelated content.
   */
  material: string;
  /** The width this reader sees the statement at, as it changes. */
  onReadingWidth?: (width: number) => void;
  surface: CollaborationSurface;
}) {
  const { paneRef, canvasRef, engaged, scale, contentHeight, paneWidth } =
    useStatementCanvas(active, material, logicalWidth);
  const mirroring = engaged && logicalWidth !== null;

  React.useEffect(() => {
    if (paneWidth > 0) onReadingWidth?.(Math.round(paneWidth * 100) / 100);
  }, [onReadingWidth, paneWidth]);

  return (
    <div className="w-full" ref={paneRef} style={{ overflowAnchor: 'none' }}>
      <div
        className="mx-auto"
        style={mirroring ? {
          width: logicalWidth * scale,
          height: contentHeight > 0 ? contentHeight * scale : undefined,
        } : undefined}
      >
        <div
          ref={canvasRef}
          style={mirroring ? {
            width: logicalWidth,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          } : undefined}
          {...(engaged ? canvasProps(surface, material) : {})}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
