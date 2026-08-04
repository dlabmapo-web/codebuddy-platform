import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJudge0Batch } from './judge0Client';

type Judge0Submission = {
  source_code: string;
  stdin: string;
  expected_output: string;
  cpu_time_limit: number;
  memory_limit: number;
  enable_network: boolean;
  callback_url: string;
};

function decode(value: string): string {
  return Buffer.from(value, 'base64').toString('utf8');
}

/** 실제로 전송된 요청의 Base64 필드를 풀어서 확인한다 */
function sentSubmissions(fetchMock: ReturnType<typeof vi.fn>): Judge0Submission[] {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  const parsed = JSON.parse(init.body as string) as {
    submissions: (Judge0Submission & Record<string, unknown>)[];
  };
  return parsed.submissions.map((item) => ({
    ...item,
    source_code: decode(item.source_code),
    stdin: decode(item.stdin),
    expected_output: decode(item.expected_output),
  }));
}

const BARE_INPUT_SOURCE = `name = input()
password = input()
print(name, password)`;

const PROMPTED_INPUT_SOURCE = `name = input("Enter your name: ")
password = input("Enter your password: ")
print(f"Welcome, {name}")`;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv('JUDGE0_API_URL', 'https://judge0.test');
  vi.stubEnv('JUDGE0_PYTHON_LANGUAGE_ID', '71');
  vi.stubEnv('JUDGE0_API_KEY', '');
  vi.stubEnv('JUDGE0_API_HOST', '');

  // 정상 응답은 보낸 케이스 수와 같은 개수의 토큰을 돌려준다.
  fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const { submissions } = JSON.parse(init.body as string) as { submissions: unknown[] };
    return new Response(
      JSON.stringify(submissions.map((_, index) => ({ token: `token-${index + 1}` }))),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const baseCase = {
  cpuTimeLimitSec: 2,
  memoryLimitKb: 128 * 1024,
  callbackUrl: 'https://cove.test/api/judge/callback/token',
};

describe('createJudge0Batch request contract', () => {
  it('sends a two-line test case as one multiline stdin with unchanged expected output', async () => {
    await createJudge0Batch([
      {
        ...baseCase,
        sourceCode: BARE_INPUT_SOURCE,
        stdin: 'Alice\nsecret123\n',
        expectedOutput: 'Alice secret123',
      },
      {
        ...baseCase,
        sourceCode: PROMPTED_INPUT_SOURCE,
        stdin: 'Alice\nsecret123\n',
        expectedOutput: 'Enter your name: Enter your password: Welcome, Alice',
      },
    ]);

    const [bare, prompted] = sentSubmissions(fetchMock);

    expect(bare.stdin).toBe('Alice\nsecret123\n');
    expect(bare.source_code).toBe(BARE_INPUT_SOURCE);
    expect(bare.expected_output).toBe('Alice secret123');

    // 프롬프트는 기대 출력의 일부로 그대로 전달된다 — 서버는 소스를 고치지 않는다.
    expect(prompted.stdin).toBe('Alice\nsecret123\n');
    expect(prompted.source_code).toBe(PROMPTED_INPUT_SOURCE);
    expect(prompted.expected_output).toBe(
      'Enter your name: Enter your password: Welcome, Alice',
    );
  });

  it('keeps intentional blank input lines and trailing newlines intact', async () => {
    await createJudge0Batch([{
      ...baseCase,
      sourceCode: BARE_INPUT_SOURCE,
      stdin: 'first\n\nthird\n',
      expectedOutput: 'first  third',
    }]);

    expect(sentSubmissions(fetchMock)[0].stdin).toBe('first\n\nthird\n');
  });

  it('applies the problem limits and never enables network access', async () => {
    await createJudge0Batch([{
      ...baseCase,
      sourceCode: 'print(1)',
      stdin: '',
      expectedOutput: '1',
    }]);

    const [submission] = sentSubmissions(fetchMock);
    expect(submission.cpu_time_limit).toBe(2);
    expect(submission.memory_limit).toBe(128 * 1024);
    expect(submission.enable_network).toBe(false);
    expect(submission.callback_url).toBe(baseCase.callbackUrl);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://judge0.test/submissions/batch?base64_encoded=true',
    );
  });

  it('rejects a batch whose token count does not match the cases sent', async () => {
    fetchMock.mockResolvedValueOnce(new Response(
      JSON.stringify([{ token: 'only-one' }]),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));

    await expect(createJudge0Batch([
      { ...baseCase, sourceCode: 'print(1)', stdin: '', expectedOutput: '1' },
      { ...baseCase, sourceCode: 'print(2)', stdin: '', expectedOutput: '2' },
    ])).rejects.toThrow('invalid batch response');
  });
});
