/**
 * The one description of how the curriculum navigator occupies a fullscreen
 * workspace.
 *
 * Both fullscreen pages lay themselves out differently below the header — the
 * student has a two-pane split, the teacher a three-pane one — but the panel
 * itself must behave identically in both. Expressing that as shared class
 * strings rather than per-page offsets is what keeps a change to the panel
 * width from landing on one role and not the other.
 */

/**
 * Wide enough for a numbered row and a status word without wrapping.
 *
 * Written out in the class strings below rather than interpolated: Tailwind
 * finds utilities by scanning source text, and a class assembled at runtime is
 * a class that never gets generated.
 */
export const NAVIGATOR_WIDTH_PX = 320;

/**
 * The panel is a column, not a cover.
 *
 * The threshold is the one the workspace itself uses to show two panes at
 * once, which is `md` and not `lg`. That distinction is the whole rule: as
 * soon as the statement and the editor are on screen together, a panel that
 * floats over them hides the problem the reader opened it to navigate. It
 * takes width instead, and nothing it opens beside becomes unreadable.
 *
 * Below that the workspace is a single pane behind tabs, so there is no width
 * to take and nothing to cover but the one pane being read. There the panel
 * floats — still non-modal, still leaving a margin through which the workspace
 * is visible and operable, and dismissed with Escape, the trigger, or its own
 * close button.
 *
 * Between `md` and `lg` the column is narrower, because 320px out of 768px is
 * most of the room the statement had.
 */
export function navigatorPanelClass(dockAt: 'md' | 'lg'): string {
  const base = [
    'flex min-h-0 flex-col overflow-hidden border-r border-border bg-card',
    // Single-pane widths: an overlay that does not dim, blur, or inert what is
    // behind it. Underscores preserve the whitespace CSS requires around `-`.
    'absolute inset-y-0 left-0 z-30 w-[calc(100%_-_3rem)] max-w-[20rem] shadow-xl',
  ];
  const dock =
    dockAt === 'md'
      ? 'md:static md:z-auto md:w-[20rem] md:max-w-none md:shrink-0 md:shadow-none'
      : 'lg:static lg:z-auto lg:w-[20rem] lg:max-w-none lg:shrink-0 lg:shadow-none';
  return [...base, dock].join(' ');
}

/**
 * The row the panel and the workspace share.
 *
 * `relative` is what the narrow overlay positions against, and `min-h-0` is
 * what lets the tree scroll instead of pushing the page taller.
 */
export const navigatorRow = 'relative flex min-h-0 flex-1';

/**
 * Only the tree scrolls.
 *
 * `min-h-0` because a flex child's default minimum is its content; without it
 * the panel grows and the whole page scrolls instead. Overscroll is contained
 * so reaching the end of the outline does not start scrolling the editor
 * behind it, and the scrollbar gutter is stable so expanding a module does not
 * shift every title by the scrollbar's width.
 */
export const navigatorScroll =
  'min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]';
