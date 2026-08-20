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
 * The value itself lives in `--cove-navigator-width` in `globals.css`, which
 * is what actually sizes the panel. This constant exists for code that needs
 * the number rather than the class.
 */
export const NAVIGATOR_WIDTH_PX = 288;

/**
 * The panel is a column, not a cover.
 *
 * The threshold is the one the workspace itself uses to show two panes at
 * once — `md` for the student, `lg` for the teacher, whose row of panes does
 * not exist below it. That distinction is the whole rule: as soon as the
 * statement and the editor are on screen together, a panel that floats over
 * them hides the problem the reader opened it to navigate. It takes width
 * instead, and nothing it opens beside becomes unreadable.
 *
 * Below that the workspace is a single pane behind tabs, so there is no width
 * to take and nothing to cover but the one pane being read. There the panel
 * floats — still non-modal, still leaving a margin through which the workspace
 * is visible and operable, and dismissed with Escape, the trigger, or its own
 * close button.
 *
 * Position, width and shadow all come from `.cove-navigator` in `globals.css`
 * rather than from utilities. Safari discards Tailwind's arbitrary-value
 * selectors, and a panel that loses its width while keeping `shrink-0` grows
 * to max-content and crushes the workspace beside it — which is what a teacher
 * on Safari saw. Only the parts with no arbitrary values stay as classes.
 */
export function navigatorPanelProps(dockAt: 'md' | 'lg'): {
  className: string;
  'data-dock': 'md' | 'lg';
} {
  return {
    className:
      'cove-navigator flex min-h-0 flex-col overflow-hidden border-r border-border bg-card',
    'data-dock': dockAt,
  };
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
