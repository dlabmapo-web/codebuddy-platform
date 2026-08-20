'use client';

import * as React from 'react';

/**
 * The navigator's visibility, for a header trigger and a panel that are not
 * siblings.
 *
 * The panel is non-modal by design — the workspace beside it stays operable,
 * so focus is not trapped and nothing behind it is inerted. What that does
 * require is somewhere sensible for focus to land when the panel closes:
 * whichever of the three ways it closed, it returns to the trigger, which is
 * the element the reader used to get here.
 */
export function useNavigatorPanel(panelId: string) {
  // Every fresh student or teacher problem workspace starts with its course
  // context visible. This state stays local to the mounted workspace: closing
  // survives in-place problem movement, while leaving and re-entering starts
  // open again without persisting a preference.
  const [open, setOpen] = React.useState(true);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  const close = React.useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const toggle = React.useCallback(() => setOpen((current) => !current), []);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // Escape closes the panel and changes nothing else: not the displayed
      // exercise, not a teacher's preview, not the live watch.
      if (event.key !== 'Escape') return;
      // ...and not a dialog's Escape. A modal owns that key while it is open,
      // and dismissing one must not also dismiss the panel behind it — which
      // the reader cannot see past, so the panel's disappearance reads as the
      // workspace rearranging itself for no reason.
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      close();
    };
    // Capture, so this runs before the dialog's own handler on `document` and
    // can still see it open. On the bubble path the dialog has already begun
    // closing and the check above would miss it.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [close, open]);

  return { close, open, panelId, toggle, triggerRef };
}
