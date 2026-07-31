'use client';

import * as React from 'react';

import { previewDocument } from '../_lib/exercise-draft';

/**
 * Authored HTML stays in an iframe so it can never restyle or script the
 * studio around it. `allow-same-origin` (without `allow-scripts`) keeps script
 * execution blocked while letting us measure the content and size the frame to
 * it — a fixed height would otherwise leave a large blank gap under short
 * descriptions.
 */
export function RichTextFrame({
  content,
  fallbackHeight = 288,
  minHeight = 60,
  padding,
  title,
}: {
  content: string;
  minHeight?: number;
  /** Used until the content is measured, and if measuring is unavailable. */
  fallbackHeight?: number;
  padding?: number;
  title: string;
}) {
  const frameRef = React.useRef<HTMLIFrameElement>(null);
  const [measured, setMeasured] = React.useState<number | null>(null);

  React.useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    let observer: ResizeObserver | undefined;
    let cancelled = false;

    const measure = () => {
      const body = frame.contentDocument?.body;
      // An about:blank document reports 0 before srcDoc swaps in; ignore it so
      // the frame doesn't lock to an empty measurement.
      if (!body || cancelled) return false;
      const height = Math.ceil(body.scrollHeight);
      if (height <= 0) return false;
      setMeasured(Math.max(minHeight, height));
      return true;
    };

    const attach = () => {
      if (cancelled) return;
      measure();
      const body = frame.contentDocument?.body;
      if (!body || observer) return;
      // Late-loading images change the height after the initial measure.
      observer = new ResizeObserver(() => measure());
      observer.observe(body);
    };

    frame.addEventListener('load', attach);
    attach();

    /*
     * srcDoc can finish loading before this effect runs, in which case the
     * load event never arrives. Retry a few frames to close that race rather
     * than leaving the frame stuck at its fallback height.
     */
    const retries = [0, 60, 200, 500].map((delay) =>
      window.setTimeout(attach, delay),
    );

    return () => {
      cancelled = true;
      retries.forEach(window.clearTimeout);
      frame.removeEventListener('load', attach);
      observer?.disconnect();
    };
  }, [content, minHeight]);

  return (
    <iframe
      // Unmeasured content shows at a generous height rather than collapsing.
      className="w-full border-0 bg-transparent"
      ref={frameRef}
      sandbox="allow-same-origin"
      scrolling="no"
      srcDoc={previewDocument(content, padding)}
      style={{ height: measured ?? fallbackHeight }}
      title={title}
    />
  );
}
