'use client';

import type { CollaborationSurface } from '@cove/shared';
import * as React from 'react';

import { canvasProps } from '@/lib/monitoring/awareness/surfaces';
import {
  STATEMENT_CANVAS_WIDTH,
  useStatementCanvas,
} from '@/lib/workspace/statement-canvas';

/**
 * The statement, laid out at a fixed logical width while collaborating.
 *
 * A pointer shared between two people has to be a fraction of a box that means
 * the same thing on both screens. A scrolling, reflowing pane is not that box:
 * the same fraction lands on different text when the panes differ in width or
 * scroll position. Laying the content out at a fixed width and scaling it to
 * fit makes the layout a function of the content alone, so the two screens
 * agree by construction.
 *
 * Only while collaborating. An unwatched student reads the statement exactly as
 * they always have — reflowing to their pane, honouring their browser zoom,
 * with no minimum width — because monitoring must not change the experience of
 * someone nobody is watching.
 */
export function StatementCanvas({
  active,
  children,
  material,
  surface,
}: {
  /** True only while a shared document exists. */
  active: boolean;
  children: React.ReactNode;
  /**
   * The document this layout comes from, published with every position taken
   * against it so a peer rendering something else refuses it rather than
   * drawing an exact arrow on unrelated content.
   */
  material: string;
  surface: CollaborationSurface;
}) {
  const { paneRef, canvasRef, engaged, scale, contentHeight } =
    useStatementCanvas(active, material);

  return (
    <div className="w-full" ref={paneRef} style={{ overflowAnchor: 'none' }}>
      <div
        className="mx-auto"
        style={engaged ? {
          width: STATEMENT_CANVAS_WIDTH * scale,
          height: contentHeight > 0 ? contentHeight * scale : undefined,
        } : undefined}
      >
        <div
          ref={canvasRef}
          style={engaged ? {
            width: STATEMENT_CANVAS_WIDTH,
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
