export function createSampleInputQueue(input: string): string[] {
  const normalized = input.replace(/\r\n?/g, '\n');
  if (normalized === '') return [];

  const lines = normalized.split('\n');
  if (normalized.endsWith('\n')) lines.pop();
  return lines;
}

export function normalizeSampleOutput(output: string): string {
  return output.replace(/\r\n?/g, '\n').replace(/\s+$/u, '');
}

export function isSampleOutputMatch(actual: string, expected: string): boolean {
  return normalizeSampleOutput(actual) === normalizeSampleOutput(expected);
}
