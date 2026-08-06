'use client';

import * as React from 'react';

import { iframePointerMoveEvent } from '@/lib/monitoring/awareness/iframe-pointer-capture';

import { withAnonymousImageCors } from './rich-text-html';

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
    let detachPointerBridge: () => void = () => undefined;

    const bridgePointer = () => {
      const innerDocument = frame.contentDocument;
      const innerWindow = frame.contentWindow;
      if (!innerDocument || !innerWindow) return;
      // WebKit can keep the same Document wrapper while replacing about:blank
      // with srcDoc. Reattach on every load/retry instead of using object
      // identity as proof that the live document is already wired.
      detachPointerBridge();
      const forward = (event: MouseEvent) => {
        frame.dispatchEvent(
          new CustomEvent(iframePointerMoveEvent, {
            bubbles: true,
            detail: { clientX: event.clientX, clientY: event.clientY },
          }),
        );
      };
      innerWindow.addEventListener('pointermove', forward, true);
      // WebKit's sandboxed srcDoc path reports Mouse Events consistently even
      // when Pointer Events are absent. The outer throttle coalesces browsers
      // that report both.
      innerWindow.addEventListener('mousemove', forward, true);
      detachPointerBridge = () => {
        innerWindow.removeEventListener('pointermove', forward, true);
        innerWindow.removeEventListener('mousemove', forward, true);
      };
    };

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
      bridgePointer();
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
      detachPointerBridge();
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

/**
 * The document shell authored HTML renders inside. Styling lives with the
 * component that injects it rather than with the draft model, so the two
 * features sharing this frame cannot drift apart.
 */
export function previewDocument(content: string, padding = 16) {
  const body = content.trim().length > 0 ? withAnonymousImageCors(content) : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}
html,body{margin:0}
body{padding:${padding}px;font-family:"Pretendard Variable",Pretendard,system-ui,sans-serif;color:#16181d;font-size:14.5px;line-height:1.75;letter-spacing:-0.006em;word-break:break-word}
body>:first-child{margin-top:0}
body>:last-child{margin-bottom:0}
p{margin:0 0 0.75em}
h1,h2,h3,h4{margin:1.25em 0 0.5em;font-weight:700;line-height:1.35}
h1{font-size:1.4em}h2{font-size:1.2em}h3{font-size:1.05em}h4{font-size:1em}
ul,ol{margin:0 0 0.75em;padding-left:1.35em}
li{margin:0.2em 0}
a{color:#1b64da;text-decoration:underline;text-underline-offset:2px}
strong,b{font-weight:700}
em,i{font-style:italic}
s{text-decoration:line-through}
img{max-width:100%;height:auto;border-radius:8px;display:block;margin:0.5em 0}
code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:0.9em;background:#f1f5f9;padding:0.15em 0.35em;border-radius:4px}
pre{margin:0 0 0.75em;padding:12px 14px;background:#0f172a;color:#e2e8f0;border-radius:8px;overflow-x:auto;white-space:pre-wrap;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:0.85em;line-height:1.6}
pre code{background:none;padding:0;color:inherit;font-size:1em}
blockquote{margin:0 0 0.75em;padding:0.1em 0 0.1em 0.9em;border-left:3px solid #e5e8ec;color:#5a6270}
table{border-collapse:collapse;width:100%;margin:0 0 0.75em;font-size:0.95em}
th,td{border:1px solid #e5e8ec;padding:6px 9px;text-align:left}
th{background:#f6f7f9;font-weight:700}
hr{border:0;border-top:1px solid #e5e8ec;margin:1.2em 0}
</style></head><body>${body}</body></html>`;
}
