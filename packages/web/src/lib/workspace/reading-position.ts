/** A local content anchor. It never leaves the reader's browser. */
export type ReadingAnchor = { top: () => number | null; offset: number };

export function readingPane(element: HTMLElement): HTMLElement | null {
  let parent = element.parentElement;
  while (parent) {
    if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) return parent;
    parent = parent.parentElement;
  }
  return null;
}

/** Find a text boundary/image at the pane top, including sandboxed authored HTML. */
export function captureReadingAnchor(root: HTMLElement, pane: HTMLElement): ReadingAnchor | null {
  const paneTop = pane.getBoundingClientRect().top;
  const paneBottom = pane.getBoundingClientRect().bottom;
  const candidates: { top: () => number | null; bottom: number; initial: number }[] = [];
  const scan = (container: Element, frame?: HTMLIFrameElement) => {
    const doc = container.ownerDocument;
    const project = (y: number) => {
      if (!frame) return y;
      const box = frame.getBoundingClientRect();
      return box.top + y * (box.height / (frame.offsetHeight || 1));
    };
    const walker = doc.createTreeWalker(container, 4 /* SHOW_TEXT */);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (!node.textContent?.trim() || node.parentElement?.closest('script,style')) continue;
      const text = node;
      const range = doc.createRange();
      range.selectNodeContents(text);
      const rect = range.getBoundingClientRect();
      if (!rect.height || project(rect.bottom) <= paneTop || project(rect.top) >= paneBottom) continue;
      // First visible character, not a percentage of a paragraph that may reflow.
      let low = 0;
      let high = Math.max(0, (text.textContent?.length ?? 1) - 1);
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        range.setStart(text, middle); range.setEnd(text, middle + 1);
        if (project(range.getBoundingClientRect().bottom) <= paneTop) low = middle + 1;
        else high = middle;
      }
      range.setStart(text, low); range.setEnd(text, low + 1);
      const top = () => {
        if (!text.isConnected || (frame && (!frame.isConnected || frame.contentDocument !== doc))) return null;
        const box = range.getBoundingClientRect();
        return box.height ? project(box.top) : null;
      };
      const initial = top();
      if (initial !== null) candidates.push({ top, initial, bottom: project(range.getBoundingClientRect().bottom) });
    }
    for (const image of container.querySelectorAll('img')) {
      const rect = image.getBoundingClientRect();
      if (!rect.height || project(rect.bottom) <= paneTop || project(rect.top) >= paneBottom) continue;
      const fraction = Math.max(0, Math.min(1, (paneTop - project(rect.top)) / (project(rect.bottom) - project(rect.top))));
      const top = () => {
        if (!image.isConnected) return null;
        const box = image.getBoundingClientRect();
        return project(box.top + box.height * fraction);
      };
      candidates.push({ top, initial: top()!, bottom: project(rect.bottom) });
    }
  };
  scan(root);
  for (const frame of root.querySelectorAll('iframe')) {
    try { if (frame.contentDocument?.body) scan(frame.contentDocument.body, frame); } catch { /* Keep the sandbox intact. */ }
  }
  candidates.sort((a, b) => Math.abs(a.initial - paneTop) - Math.abs(b.initial - paneTop));
  const candidate = candidates[0];
  return candidate ? { top: candidate.top, offset: candidate.initial - paneTop } : null;
}

export function restoreReadingAnchor(anchor: ReadingAnchor, pane: HTMLElement): boolean {
  const top = anchor.top();
  if (top === null) return false;
  const delta = top - pane.getBoundingClientRect().top - anchor.offset;
  if (Math.abs(delta) > 0.5) pane.scrollTop += delta;
  return true;
}
