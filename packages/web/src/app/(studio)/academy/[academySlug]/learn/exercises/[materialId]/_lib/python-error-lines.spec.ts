import enCatalog from '@cove/i18n/locales/en/python-errors.json' with { type: 'json' };
import koCatalog from '@cove/i18n/locales/ko/python-errors.json' with { type: 'json' };
import { describe, expect, it } from 'vitest';

import type { PythonExecutionError } from '@/lib/pyodide/pythonError';

import { pythonErrorLines, type Translate } from './python-error-lines';

const code = 'values = [1, 2]\nprint(values[5])\n';

const error = (
  overrides: Partial<PythonExecutionError> = {},
): PythonExecutionError => ({
  type: 'IndexError',
  message: 'list index out of range',
  line: 2,
  offset: null,
  display: 'Traceback (most recent call last):\n  File "solution.py"…\n',
  ...overrides,
});

/** Echoes the key, so the assertions can be about structure rather than copy. */
const echo: Translate = (key, values) =>
  values ? `${key}(${JSON.stringify(values)})` : key;

/** The real catalogs, so a renamed key fails here rather than in a lesson. */
function catalog(locale: 'en' | 'ko'): Translate {
  const source = locale === 'en' ? enCatalog : koCatalog;
  return (key, values) => {
    const found = key
      .split('.')
      .reduce<unknown>(
        (node, part) => (node as Record<string, unknown>)?.[part],
        source,
      );
    const text = typeof found === 'string' ? found : key;
    return values
      ? text.replace(/{{(\w+)}}/g, (_, name: string) => String(values[name]))
      : text;
  };
}

const joined = (lines: { text: string }[]) => lines.map((l) => l.text).join('');

describe('pythonErrorLines', () => {
  it("leads with Python's own one-line error, in the error colour", () => {
    const [first] = pythonErrorLines(error(), code, echo);

    expect(first).toEqual({
      kind: 'err',
      text: 'IndexError: list index out of range\n',
    });
  });

  it('drops the traceback frames entirely', () => {
    const text = joined(pythonErrorLines(error(), code, echo));

    expect(text).not.toContain('Traceback');
    expect(text).not.toContain('File "solution.py"');
  });

  it('quotes the failing line and points at the coach', () => {
    const text = joined(pythonErrorLines(error(), code, echo));

    expect(text).toContain('line_label({"line":2})');
    expect(text).toContain('print(values[5])');
    expect(text).toContain('coach.terminal_pointer');
  });

  /** The teaching belongs to the coach; repeating it here trains readers to skip both. */
  it('does not repeat the explanation', () => {
    const text = joined(pythonErrorLines(error(), code, echo));

    expect(text).not.toContain('explanation.');
    expect(text).not.toContain('family.');
  });

  it('names whatever class Python raised', () => {
    const text = joined(
      pythonErrorLines(error({ type: 'OverflowError' }), code, echo),
    );

    expect(text).toContain('OverflowError: list index out of range');
  });

  it('omits the quote when there is no line to point at', () => {
    const text = joined(
      pythonErrorLines(error({ line: null }), code, echo),
    );

    expect(text).not.toContain('line_label');
    expect(text).toContain('coach.terminal_pointer');
  });

  it('keeps the indentation an IndentationError is about', () => {
    const text = joined(
      pythonErrorLines(
        error({ type: 'IndentationError', line: 3 }),
        'def go():\n    print(1)\n      print(2)\n',
        echo,
      ),
    );

    expect(text).toContain('      print(2)');
  });

  it('survives an exception with no message', () => {
    const [first] = pythonErrorLines(error({ message: '' }), code, echo);

    expect(first?.text).toBe('IndexError\n');
  });

  it('uses only the five kinds the mirror can carry', () => {
    for (const line of pythonErrorLines(error(), code, echo)) {
      expect(['out', 'err', 'in', 'meta', 'info']).toContain(line.kind);
    }
  });

  it('reads as real copy in English', () => {
    const text = joined(pythonErrorLines(error(), code, catalog('en')));

    expect(text).toContain('IndexError: list index out of range');
    expect(text).toContain('Line 2:  print(values[5])');
    expect(text).toContain('Error interpretation tab');
  });

  it('reads as real copy in Korean', () => {
    const text = joined(pythonErrorLines(error(), code, catalog('ko')));

    expect(text).toContain('2번째 줄:  print(values[5])');
    expect(text).toContain('오류 해석 탭');
  });
});
