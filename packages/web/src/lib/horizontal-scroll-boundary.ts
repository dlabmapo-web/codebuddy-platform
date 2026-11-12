/** Preserve local horizontal scrolling while consuming gestures at the app boundary. */
export function installHorizontalScrollBoundary(doc: Document): () => void {
  const root = doc.documentElement;
  // srcDoc can expose a Document before its new root has been installed.
  if (!root) return () => {};
  const previousAttribute = root.getAttribute('data-cove-scroll-boundary');
  const previousOverscroll = root.style.overscrollBehaviorX;
  root.setAttribute('data-cove-scroll-boundary', '');
  root.style.overscrollBehaviorX = 'none';
  const wheel = (event: WheelEvent) => {
    // Child editors may own wheel input; never interfere with their consumption,
    // normal vertical scrolling, or the browser's zoom gesture.
    if (event.defaultPrevented || !event.cancelable || event.ctrlKey || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    for (const target of event.composedPath()) {
      // srcDoc elements belong to another realm, so instanceof Element is unsafe.
      if (!('nodeType' in target) || target.nodeType !== 1) continue;
      const element = target as Element;
      if (element === root || element === doc.body) continue;
      const style = doc.defaultView?.getComputedStyle(element);
      if (!style || !['auto', 'scroll', 'overlay'].includes(style.overflowX)) continue;
      const maximum = element.scrollWidth - element.clientWidth;
      if (maximum <= 1) continue;
      const position = style.direction === 'rtl' ? -element.scrollLeft : element.scrollLeft;
      const delta = style.direction === 'rtl' ? -event.deltaX : event.deltaX;
      if (delta < 0 ? position > 1 : position < maximum - 1) return;
    }
    // Safari can ignore CSS containment for history-swipe navigation (WebKit 240183).
    event.preventDefault();
  };
  doc.addEventListener('wheel', wheel, {passive: false});
  return () => {
    doc.removeEventListener('wheel', wheel);
    if (previousAttribute === null) root.removeAttribute('data-cove-scroll-boundary');
    else root.setAttribute('data-cove-scroll-boundary', previousAttribute);
    root.style.overscrollBehaviorX = previousOverscroll;
  };
}
