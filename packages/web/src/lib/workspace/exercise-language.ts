import { isCompiledLanguage, parseGccDiagnostics, type ExerciseLanguage } from '@cove/shared';

import type { MonacoCodeEditor } from '@/lib/monitoring/yjs-monaco';

/** Monaco's language id for an exercise: Python, or GCC's C and C++. */
/** Accepts a stored language string too; anything unknown reads as Python. */
export function monacoLanguageFor(language: ExerciseLanguage | string | undefined): 'python' | 'c' | 'cpp' {
  return language === 'C' ? 'c' : language === 'CPP' ? 'cpp' : 'python';
}

/** The editor header's label key, in the `learn` and `content` namespaces. */
export function languageLabelKey(language: ExerciseLanguage | string | undefined): 'language_python' | 'language_c' | 'language_cpp' {
  return language === 'C' ? 'language_c' : language === 'CPP' ? 'language_cpp' : 'language_python';
}

/** The source file the native compiler is given. */
export function sourceFileName(language: ExerciseLanguage | undefined): string {
  return language === 'C' ? 'main.c' : language === 'CPP' ? 'main.cpp' : 'main.py';
}

/** The command a Run banner shows, as Elice's runner script reads. */
export function runCommandFor(language: ExerciseLanguage | undefined): string {
  return language === 'C'
    ? 'gcc main.c -o main && ./main'
    : language === 'CPP'
      ? 'g++ main.cpp -o main && ./main'
      : 'python solution.py';
}

/** Starter code a new C or C++ exercise gets (spec §3.1). */
export const compiledStarterTemplates = {
  C: '#include <stdio.h>\n\nint main(void) {\n\n    return 0;\n}\n',
  CPP: '#include <iostream>\nusing namespace std;\n\nint main() {\n\n    return 0;\n}\n',
} as const;

/**
 * The starter code to keep or replace when an author changes language: an
 * empty starter, or one still equal to a template, becomes the new
 * language's template; anything an author wrote stays.
 */
export function starterAfterLanguageChange(starter: string, next: ExerciseLanguage): string {
  const isTemplate = !starter.trim() || Object.values(compiledStarterTemplates).includes(starter as never);
  if (!isTemplate) return starter;
  return isCompiledLanguage(next) ? compiledStarterTemplates[next] : '';
}

/**
 * GCC's located messages as editor marks: errors red, warnings amber. The
 * terminal keeps the full text; this connects it to the lines it names.
 * Returns its own removal, like `markErrorLine`.
 */
export function markCompileDiagnostics(editor: MonacoCodeEditor, diagnostics: string | null): () => void {
  let decorations: string[] = [];
  const clear = () => {
    decorations = editor.deltaDecorations(decorations, []);
  };
  if (!diagnostics) return clear;
  const lineCount = editor.getModel()?.getLineCount() ?? 1;
  const marks = parseGccDiagnostics(diagnostics).filter((item) => item.severity !== 'note');
  decorations = editor.deltaDecorations(
    decorations,
    marks.map((item) => {
      const line = Math.min(Math.max(1, item.line), lineCount);
      const error = item.severity === 'error';
      return {
        range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
        options: {
          isWholeLine: true,
          className: error ? 'cove-error-line' : 'cove-warning-line',
          glyphMarginClassName: error ? 'cove-error-glyph' : 'cove-warning-glyph',
          glyphMarginHoverMessage: { value: `${item.line}:${item.column} ${item.message}` },
        },
      };
    }),
  );
  return clear;
}
