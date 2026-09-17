import type { OnMount } from '@monaco-editor/react';

/**
 * A mount handler that pins the model to LF before anything else sees it.
 *
 * Monaco takes a model's line ending from its text, and text with no line
 * break gets the platform default — CRLF on Windows. The student draft is
 * always LF (`toSharedDocumentText`), so a CRLF model never equals the
 * controlled `value`, and `@monaco-editor/react` answers every keystroke by
 * replacing the whole model, which throws the caret to the end of the
 * document. Pinned once here, the model stays LF: edits and pastes are
 * normalized to the model's own line ending.
 */
export function pinLfOnMount(onMount?: OnMount): OnMount {
  return (editor, monaco) => {
    editor.getModel()?.setEOL(monaco.editor.EndOfLineSequence.LF);
    onMount?.(editor, monaco);
  };
}
