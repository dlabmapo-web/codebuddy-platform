/** The parts of a keydown this module reads; a React event's `nativeEvent` fits. */
type KeyEventLike = {
  key: string;
  keyCode?: number;
  isComposing?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
};

/**
 * Whether this keydown belongs to an IME composition — a Hangul syllable still
 * being assembled, or the Enter that commits it.
 *
 * Both signals are needed. Chromium reports the committing Enter with
 * `isComposing`; Safari fires `compositionend` first, so `isComposing` is
 * already false and only the legacy `keyCode` 229 gives it away.
 */
export function isImeComposing(event: KeyEventLike): boolean {
  return event.isComposing === true || event.keyCode === 229;
}

/** Enter that submits a line, never the one that commits a composition. */
export function isSubmitLineKey(event: KeyEventLike): boolean {
  return event.key === 'Enter' && !isImeComposing(event);
}

/**
 * Ctrl+D, a terminal's end of input, on every platform.
 *
 * Ctrl rather than Cmd on macOS too: that is what a Mac terminal uses, and
 * Cmd+D belongs to the browser.
 */
export function isEndOfInputKey(event: KeyEventLike): boolean {
  return (
    event.ctrlKey === true &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === 'd' &&
    !isImeComposing(event)
  );
}
