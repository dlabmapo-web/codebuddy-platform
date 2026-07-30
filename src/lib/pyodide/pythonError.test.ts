import { describe, expect, it } from 'vitest';
import {
  createSyntaxLesson,
  isSyntaxExecutionError,
  type PythonExecutionError,
} from './pythonError';

function error(
  type: string,
  message: string,
  line: number | null = 3,
): PythonExecutionError {
  return { type, message, line, offset: 8, display: `${type}: ${message}` };
}

describe('createSyntaxLesson', () => {
  it.each([
    ['SyntaxError', "expected ':'", 'missing-colon'],
    ['IndentationError', 'expected an indented block after if statement on line 2', 'expected-indented-block'],
    ['IndentationError', 'unexpected indent', 'unexpected-indent'],
    ['TabError', 'inconsistent use of tabs and spaces in indentation', 'tabs-and-spaces'],
    ['SyntaxError', "'(' was never closed", 'unclosed-delimiter'],
    ['SyntaxError', 'unterminated string literal (detected at line 3)', 'unterminated-string'],
    ['SyntaxError', "invalid syntax. Maybe you meant '==' or ':=' instead of '='?", 'assignment-in-condition'],
    ['SyntaxError', 'invalid syntax. Perhaps you forgot a comma?', 'missing-separator'],
  ])('maps %s: %s to %s', (type, message, category) => {
    expect(createSyntaxLesson(error(type, message))?.category).toBe(category);
  });

  it('returns a Korean generic lesson for an unknown syntax message', () => {
    const lesson = createSyntaxLesson(error('SyntaxError', 'unknown parser message'));
    expect(lesson?.category).toBe('generic-syntax-error');
    expect(lesson?.title).toContain('파이썬');
    expect(lesson?.where).toContain('3번째 줄');
  });

  it('does not create syntax lessons for runtime errors', () => {
    const runtimeError = error('NameError', "name 'x' is not defined");
    expect(isSyntaxExecutionError(runtimeError)).toBe(false);
    expect(createSyntaxLesson(runtimeError)).toBeNull();
  });
});
