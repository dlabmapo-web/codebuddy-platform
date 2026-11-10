import { describe, expect, it, vi } from 'vitest';

import {
  compiledStarterTemplates,
  languageLabelKey,
  markCompileDiagnostics,
  monacoLanguageFor,
  runCommandFor,
  starterAfterLanguageChange,
} from './exercise-language';

describe('exercise language helpers', () => {
  it('maps each language to Monaco, its label and its Run command', () => {
    expect(['PYTHON', 'C', 'CPP', undefined, 'RUST'].map(monacoLanguageFor)).toEqual(['python', 'c', 'cpp', 'python', 'python']);
    expect(languageLabelKey('CPP')).toBe('language_cpp');
    expect(runCommandFor('C')).toBe('gcc main.c -o main && ./main');
    expect(runCommandFor('CPP')).toBe('g++ main.cpp -o main && ./main');
  });

  it('replaces only an empty or template starter when the language changes', () => {
    expect(starterAfterLanguageChange('', 'C')).toBe(compiledStarterTemplates.C);
    expect(starterAfterLanguageChange(compiledStarterTemplates.C, 'CPP')).toBe(compiledStarterTemplates.CPP);
    expect(starterAfterLanguageChange(compiledStarterTemplates.CPP, 'PYTHON')).toBe('');
    expect(starterAfterLanguageChange('print(1)\n', 'C')).toBe('print(1)\n');
  });

  it('marks located errors and warnings, skips notes, and clamps to the model', () => {
    const deltaDecorations = vi.fn((_old: string[], next: unknown[]) => next.map((_, index) => `d${index}`));
    const editor = { deltaDecorations, getModel: () => ({ getLineCount: () => 3 }) };
    const clear = markCompileDiagnostics(editor as never, [
      "main.c:2:5: error: expected ';' before 'return'",
      'main.c:2:5: note: here',
      'main.c:9:1: warning: unused variable',
      "/usr/bin/ld: undefined reference to `main'",
    ].join('\n'));
    const marks = deltaDecorations.mock.calls[0]![1] as Array<{ range: { startLineNumber: number }; options: { className: string } }>;
    expect(marks.map((mark) => [mark.range.startLineNumber, mark.options.className])).toEqual([
      [2, 'cove-error-line'],
      [3, 'cove-warning-line'],
    ]);
    clear();
    expect(deltaDecorations).toHaveBeenLastCalledWith(['d0', 'd1'], []);
  });
});
