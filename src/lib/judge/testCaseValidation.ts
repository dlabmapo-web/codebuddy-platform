export interface TestCaseInput {
  input: string;
  expected_output: string;
  is_sample: boolean;
  is_hidden: boolean;
  order_no: number;
}

const MAX_CASES = 50;
const MAX_TEXT_BYTES = 64 * 1024;

export interface TestCaseValidationOptions {
  requiresInput?: boolean;
}

export function validateTestCases(
  testCases: TestCaseInput[],
  options: TestCaseValidationOptions = {},
): string | null {
  if (testCases.length === 0) return '테스트케이스를 1개 이상 입력해주세요.';
  if (testCases.length > MAX_CASES) return '테스트케이스는 최대 50개까지 등록할 수 있습니다.';

  for (let index = 0; index < testCases.length; index += 1) {
    const item = testCases[index];
    const label = `테스트케이스 ${index + 1}`;
    if (options.requiresInput && item.input === '') {
      return `${label}의 표준 입력값을 입력해주세요.`;
    }
    if (!item.expected_output?.trim()) return `${label}의 정답 출력값을 입력해주세요.`;
    if (item.is_sample === item.is_hidden) {
      return `${label}은 예제 또는 비공개 중 하나로 설정해야 합니다.`;
    }
    if (
      Buffer.byteLength(item.input ?? '', 'utf8') > MAX_TEXT_BYTES
      || Buffer.byteLength(item.expected_output ?? '', 'utf8') > MAX_TEXT_BYTES
    ) {
      return `${label}의 입력과 출력은 각각 64 KiB 이하여야 합니다.`;
    }
  }
  return null;
}
