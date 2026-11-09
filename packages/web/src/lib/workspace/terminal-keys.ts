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

/**
 * A paste into the one-line terminal field, taken the way Elice's terminal
 * takes a copied example.
 *
 * The field cannot hold a line break, so the browser would join a pasted block
 * into one line and send it to the program's first `input()`. Instead every
 * break ends a line that is sent at once, and the last line always stays in the
 * field for Enter — even when the copy ends with a break, as an example's Copy
 * button does, so the program runs when the person presses Enter, not on paste.
 * Null when the paste has no break at all, so the browser's own paste runs.
 */
export function splitPastedInput(input: {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  pasted: string;
}): { lines: string[]; remainder: string } | null {
  const pasted = input.pasted.replace(/\r\n?/g, '\n');
  if (!pasted.includes('\n')) return null;
  const body = pasted.endsWith('\n') ? pasted.slice(0, -1) : pasted;
  const lines = (input.value.slice(0, input.selectionStart) + body + input.value.slice(input.selectionEnd)).split('\n');
  const remainder = lines.pop()!;
  return { lines, remainder };
}
