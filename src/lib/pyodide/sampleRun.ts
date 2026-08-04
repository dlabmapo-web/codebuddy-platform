export function createSampleInputQueue(input: string): string[] {
  const normalized = input.replace(/\r\n?/g, '\n');
  if (normalized === '') return [];

  const lines = normalized.split('\n');
  if (normalized.endsWith('\n')) lines.pop();
  return lines;
}

export type SampleStdinRequest =
  | { type: 'line'; line: string }
  | { type: 'eof' };

/**
 * 고정 입력 실행(테스트 N)의 stdin 정책. 공식 채점과 동일하게 비대화식이다 —
 * 큐가 비면 학생에게 입력을 요청하지 않고 stdin을 닫는다.
 *
 * 요청마다 EOF를 다시 돌려주는 것이 중요하다. EOF를 한 번만 보내면
 * EOFError를 잡고 input()을 다시 호출하는 코드에서 실행이 멈춘다.
 */
export function nextSampleStdin(queue: readonly string[]): {
  request: SampleStdinRequest;
  remaining: string[];
} {
  if (queue.length === 0) {
    return { request: { type: 'eof' }, remaining: [] };
  }
  return {
    request: { type: 'line', line: queue[0] },
    remaining: queue.slice(1),
  };
}

export interface SampleStdinEffects {
  provideLine: (line: string) => void;
  sendEOF: () => void;
}

/**
 * 고정 입력의 다음 요청을 실제 실행기 효과로 연결한다. 수동 입력 큐를 받지 않으므로
 * 테스트 입력이 소진된 뒤 학생 입력으로 빠지는 경로를 만들 수 없다.
 */
export function dispatchSampleStdin(
  queue: readonly string[],
  effects: SampleStdinEffects,
): string[] {
  const { request, remaining } = nextSampleStdin(queue);
  if (request.type === 'eof') effects.sendEOF();
  else effects.provideLine(request.line);
  return remaining;
}

const JUDGE0_TRAILING_BYTES = /[\u0000-\u0020]+$/u;

/**
 * Judge0 CE의 strip 구현과 같은 비교 정규화:
 * LF로 줄을 나눈 뒤 각 줄과 전체 출력 끝의 NUL/ASCII 공백을 제거한다.
 */
export function normalizeSampleOutput(output: string): string {
  return output
    .split('\n')
    .map((line) => line.replace(JUDGE0_TRAILING_BYTES, ''))
    .join('\n')
    .replace(JUDGE0_TRAILING_BYTES, '');
}

export type SampleOutputComparison =
  | 'match'
  | 'mismatch';

export function compareSampleOutput(
  actual: string,
  expected: string,
): SampleOutputComparison {
  if (normalizeSampleOutput(actual) === normalizeSampleOutput(expected)) {
    return 'match';
  }
  return 'mismatch';
}

export interface SampleExecutionSignals {
  stderr: string;
  pythonError: unknown | null;
  executionError: string | null;
}

/** stderr 출력만으로는 Judge0 실행 실패가 아니므로 예외/실행기 오류만 판정한다. */
export function hasSampleExecutionFailure(result: SampleExecutionSignals): boolean {
  return result.pythonError !== null || result.executionError !== null;
}
