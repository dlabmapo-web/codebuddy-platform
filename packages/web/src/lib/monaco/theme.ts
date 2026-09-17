import type { Monaco } from '@monaco-editor/react';

/**
 * Every code surface's font, installed fonts only.
 *
 * Fira Code is used where someone has installed it, but nothing loads it: a
 * web font arriving after Monaco has measured its glyphs leaves the caret drawn
 * away from the text. macOS has neither Fira Code nor Consolas, so SF Mono and
 * Menlo come before the Windows face; the Korean coding faces keep Hangul
 * closer to the grid wherever they are installed.
 */
export const EDITOR_FONT_FAMILY =
  "'Fira Code', 'SF Mono', Menlo, Monaco, Consolas, D2Coding, 'Nanum Gothic Coding', monospace";

export function registerPaircodeTheme(monaco: Monaco) {
  monaco.editor.defineTheme('paircode-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '57A64A', fontStyle: 'italic' },
      { token: 'comment.python', foreground: '57A64A', fontStyle: 'italic' },
      { token: 'keyword', foreground: '569CD6', fontStyle: 'bold' },
      { token: 'keyword.control', foreground: 'C586C0' },
      { token: 'keyword.operator', foreground: '569CD6' },
      { token: 'string', foreground: 'CE9178' },
      { token: 'string.escape', foreground: 'D7BA7D' },
      { token: 'number', foreground: 'B5CEA8' },
      { token: 'number.float', foreground: 'B5CEA8' },
      { token: 'delimiter', foreground: 'D4D4D4' },
      { token: 'identifier', foreground: '9CDCFE' },
      { token: 'type.identifier', foreground: '4EC9B0' },
      { token: 'variable', foreground: '9CDCFE' },
      { token: 'variable.parameter', foreground: 'C8C8FF' },
      { token: 'function', foreground: 'DCDCAA' },
      { token: 'constant', foreground: '4FC1FF' },
      { token: 'operator', foreground: 'D4D4D4' },
      { token: 'punctuation', foreground: 'D4D4D4' },
    ],
    colors: {
      'editor.background': '#1E1E1E',
      'editor.foreground': '#D4D4D4',
      'editor.lineHighlightBackground': '#2A2D2E',
      'editorLineNumber.foreground': '#5A5A5A',
      'editorLineNumber.activeForeground': '#C6C6C6',
      'editor.selectionBackground': '#264F78',
      'editor.inactiveSelectionBackground': '#3A3D41',
      'editorCursor.foreground': '#AEAFAD',
      'editorIndentGuide.background1': '#404040',
    },
  });
}
