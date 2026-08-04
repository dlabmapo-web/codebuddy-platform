import { describe, expect, it } from 'vitest';
import {
  compareSampleOutput,
  createSampleInputQueue,
  dispatchSampleStdin,
  hasSampleExecutionFailure,
  nextSampleStdin,
  normalizeSampleOutput,
} from './sampleRun';

describe('createSampleInputQueue', () => {
  it('normalizes line endings and removes one trailing newline element', () => {
    expect(createSampleInputQueue('2\r\n1 2\r\n3 4\r\n')).toEqual([
      '2',
      '1 2',
      '3 4',
    ]);
  });

  it('preserves internal and intentional final blank input lines', () => {
    expect(createSampleInputQueue('first\n\nthird')).toEqual([
      'first',
      '',
      'third',
    ]);
    expect(createSampleInputQueue('first\n\n')).toEqual(['first', '']);
    expect(createSampleInputQueue('\n')).toEqual(['']);
  });

  it('returns no queued lines for an empty sample', () => {
    expect(createSampleInputQueue('')).toEqual([]);
  });
});

describe('nextSampleStdin', () => {
  it('provides queued lines in order, including blank ones', () => {
    const first = nextSampleStdin(['Alice', '', 'secret123']);
    expect(first.request).toEqual({ type: 'line', line: 'Alice' });

    const second = nextSampleStdin(first.remaining);
    expect(second.request).toEqual({ type: 'line', line: '' });

    const third = nextSampleStdin(second.remaining);
    expect(third.request).toEqual({ type: 'line', line: 'secret123' });
    expect(third.remaining).toEqual([]);
  });

  it('closes stdin once the fixed input is exhausted', () => {
    expect(nextSampleStdin([]).request).toEqual({ type: 'eof' });
  });

  it('keeps returning EOF so caught EOFError loops cannot hang the run', () => {
    const first = nextSampleStdin([]);
    const second = nextSampleStdin(first.remaining);
    const third = nextSampleStdin(second.remaining);
    expect(second.request).toEqual({ type: 'eof' });
    expect(third.request).toEqual({ type: 'eof' });
  });

  it('does not mutate the queue it is given', () => {
    const queue = ['only'];
    nextSampleStdin(queue);
    expect(queue).toEqual(['only']);
  });
});

describe('dispatchSampleStdin', () => {
  it('provides a fixed line through the runner effect', () => {
    const provided: string[] = [];
    let eofCount = 0;
    const remaining = dispatchSampleStdin(['Alice', 'secret123'], {
      provideLine: (line) => provided.push(line),
      sendEOF: () => { eofCount += 1; },
    });

    expect(provided).toEqual(['Alice']);
    expect(eofCount).toBe(0);
    expect(remaining).toEqual(['secret123']);
  });

  it('calls the runner EOF effect every time fixed input is exhausted', () => {
    const provided: string[] = [];
    let eofCount = 0;
    const effects = {
      provideLine: (line: string) => provided.push(line),
      sendEOF: () => { eofCount += 1; },
    };

    const remaining = dispatchSampleStdin([], effects);
    dispatchSampleStdin(remaining, effects);

    expect(provided).toEqual([]);
    expect(eofCount).toBe(2);
  });
});

describe('sample execution failure', () => {
  it('does not fail only because the program wrote to stderr', () => {
    expect(hasSampleExecutionFailure({
      stderr: 'warning\n',
      pythonError: null,
      executionError: null,
    })).toBe(false);
  });

  it('fails Python exceptions and runner errors', () => {
    expect(hasSampleExecutionFailure({
      stderr: '',
      pythonError: { type: 'EOFError' },
      executionError: null,
    })).toBe(true);
    expect(hasSampleExecutionFailure({
      stderr: '',
      pythonError: null,
      executionError: 'worker failed',
    })).toBe(true);
  });
});

describe('sample output comparison', () => {
  it('uses Judge0-compatible trailing ASCII whitespace normalization', () => {
    expect(normalizeSampleOutput('answer\r\n\r\n')).toBe('answer');
    expect(compareSampleOutput('answer\n', 'answer   \r\n')).toBe('match');
    expect(compareSampleOutput('8  \n9', '8\n9')).toBe('match');
    expect(compareSampleOutput('8\t\n9', '8\n9')).toBe('match');
  });

  it('keeps internal whitespace, line order, and case strict', () => {
    expect(compareSampleOutput('A  B\nC', 'A B\nC')).toBe('mismatch');
    expect(compareSampleOutput('A\nB', 'B\nA')).toBe('mismatch');
    expect(compareSampleOutput('Answer', 'answer')).toBe('mismatch');
  });

  it('does not turn a lone carriage return into a line break', () => {
    expect(compareSampleOutput('8\r9', '8\n9')).toBe('mismatch');
  });

  it('treats input() prompt text as graded output', () => {
    const withPrompt = 'Enter your name: Enter your password: Welcome, Alice';
    expect(compareSampleOutput(withPrompt, 'Welcome, Alice')).toBe('mismatch');
    expect(compareSampleOutput(withPrompt, withPrompt)).toBe('match');
  });
});
