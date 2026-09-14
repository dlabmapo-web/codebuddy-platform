'use client';

import * as React from 'react';
import { captureReadingAnchor, readingPane, restoreReadingAnchor, type ReadingAnchor } from './reading-position';

/** Retain local content through layout changes; a user gesture replaces the anchor. */
export function useReadingPosition(
  rootRef: React.RefObject<HTMLDivElement | null>, material: string,
  layout: string,
): void {
  const anchor = React.useRef<ReadingAnchor | null>(null);
  const restoring = React.useRef(false);
  const geometry = React.useRef('');
  const size = (root: HTMLElement) => `${root.offsetWidth}:${root.offsetHeight}`;
  React.useLayoutEffect(() => {
    const root = rootRef.current;
    const pane = root && readingPane(root);
    if (!root || !pane) return;
    anchor.current = captureReadingAnchor(root, pane);
    geometry.current = size(root);
    let frame = 0;
    const capture = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!restoring.current) {
          anchor.current = captureReadingAnchor(root, pane);
          geometry.current = size(root);
        }
      });
    };
    const gesture = () => { restoring.current = false; anchor.current = null; capture(); };
    const scroll = () => { if (!restoring.current && geometry.current === size(root)) capture(); };
    pane.addEventListener('scroll', scroll);
    pane.addEventListener('wheel', gesture, { passive: true });
    pane.addEventListener('touchmove', gesture, { passive: true });
    pane.addEventListener('pointerdown', gesture);
    pane.addEventListener('keydown', gesture);
    return () => {
      cancelAnimationFrame(frame);
      anchor.current = null;
      pane.removeEventListener('scroll', scroll);
      pane.removeEventListener('wheel', gesture);
      pane.removeEventListener('touchmove', gesture);
      pane.removeEventListener('pointerdown', gesture);
      pane.removeEventListener('keydown', gesture);
    };
  }, [material, rootRef]);

  React.useLayoutEffect(() => {
    const root = rootRef.current;
    const pane = root && readingPane(root);
    if (!root || !pane) return;
    restoring.current = true;
    if (!anchor.current || !restoreReadingAnchor(anchor.current, pane)) {
      anchor.current = captureReadingAnchor(root, pane);
    }
    geometry.current = size(root);
    const frame = requestAnimationFrame(() => { restoring.current = false; });
    return () => cancelAnimationFrame(frame);
  }, [layout, material, rootRef]);
}
