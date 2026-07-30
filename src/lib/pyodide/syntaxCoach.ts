export type SyntaxAttemptState = {
  category: string;
  count: number;
  lastCode: string;
};

export function recordSyntaxAttempt(
  current: SyntaxAttemptState | null,
  category: string,
  code: string,
): SyntaxAttemptState {
  if (!current || current.category !== category) {
    return { category, count: 1, lastCode: code };
  }

  if (current.lastCode === code) return current;

  return {
    category,
    count: current.count + 1,
    lastCode: code,
  };
}

export function canAskAiForSyntaxHelp(state: SyntaxAttemptState | null): boolean {
  return Boolean(state && state.count >= 3);
}
