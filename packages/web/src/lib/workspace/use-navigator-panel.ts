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
  const [open, setOpen] = React.useState(false);
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
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close, open]);

  return { close, open, panelId, toggle, triggerRef };
}
