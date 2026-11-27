/**
 * Marks a box `revealInRegion` scrolls: the workspace's output, and the AI
 * teacher's box above it. The nearest marked box around a target is the one
 * that moves.
 */
export const revealRegionAttribute = 'data-reveal-region';

/**
 * Scrolls the nearest marked box, and nothing around it, until `target` is in view.
 *
 * `scrollIntoView` would also scroll the page and every other ancestor, which
 * moves the editor and the header away from a student who only needed one box
 * to move. `start` puts the target's top at the top of the box, for something
 * to read from its beginning; `nearest` moves it only as far as needed. Smooth
 * unless the reader asked for less motion, or the caller asks for `instant`.
 */
export function revealInRegion(target: Element | null, align: 'start' | 'nearest' = 'nearest', motion: 'smooth' | 'instant' = 'smooth') {
  const region = target?.closest<HTMLElement>(`[${revealRegionAttribute}]`);
  if (!target || !region) return;
  const box = region.getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  const margin = 8;
  let offset: number | null = null;
  if (align === 'start' || rect.height > box.height - margin * 2 || rect.top < box.top) offset = rect.top - box.top - margin;
  else if (rect.bottom > box.bottom) offset = rect.bottom - box.bottom + margin;
  if (offset === null || Math.abs(offset) < 1) return;
  const top = Math.max(0, region.scrollTop + offset);
  const still = motion === 'instant' || (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (typeof region.scrollTo === 'function') region.scrollTo({ top, behavior: still ? 'auto' : 'smooth' });
  else region.scrollTop = top;
}
