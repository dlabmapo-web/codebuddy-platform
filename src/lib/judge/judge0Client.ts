import 'server-only';

import type {
  Judge0BatchToken,
  Judge0Result,
  JudgeCaseRequest,
} from './types';

const REQUEST_TIMEOUT_MS = 12_000;
const DEFAULT_PYTHON_LANGUAGE_ID = 71;
const MAX_OUTPUT_KB = 1024;

function requiredConfig() {
  const apiUrl = process.env.JUDGE0_API_URL?.replace(/\/+$/, '');
  if (!apiUrl) throw new Error('JUDGE0_API_URL is not configured');

  const languageId = Number.parseInt(
    process.env.JUDGE0_PYTHON_LANGUAGE_ID ?? String(DEFAULT_PYTHON_LANGUAGE_ID),
    10,
  );
  if (!Number.isInteger(languageId) || languageId <= 0) {
    throw new Error('JUDGE0_PYTHON_LANGUAGE_ID is invalid');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const apiKey = process.env.JUDGE0_API_KEY;
  const apiHost = process.env.JUDGE0_API_HOST;
  if (apiKey && apiHost) {
    headers['X-RapidAPI-Key'] = apiKey;
    headers['X-RapidAPI-Host'] = apiHost;
  } else if (apiKey) {
    headers['X-Auth-Token'] = apiKey;
  }

  return { apiUrl, languageId, headers };
}

function encodeBase64(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64');
}

async function providerFetch(url: string, init: RequestInit): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 300);
    throw new Error(`Judge0 request failed (${response.status}): ${detail}`);
  }
  return response;
}

function isBatchToken(value: unknown): value is Judge0BatchToken {
  return (
    typeof value === 'object'
    && value !== null
    && typeof (value as { token?: unknown }).token === 'string'
    && (value as { token: string }).token.length > 0
  );
}

function isJudgeResult(value: unknown): value is Judge0Result {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as {
    token?: unknown;
    status?: { id?: unknown };
  };
  return (
    typeof candidate.token === 'string'
    && typeof candidate.status?.id === 'number'
  );
}

export async function createJudge0Batch(
  cases: JudgeCaseRequest[],
): Promise<Judge0BatchToken[]> {
  const { apiUrl, languageId, headers } = requiredConfig();
  const response = await providerFetch(
    `${apiUrl}/submissions/batch?base64_encoded=true`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        submissions: cases.map((item) => ({
          language_id: languageId,
          source_code: encodeBase64(item.sourceCode),
          stdin: encodeBase64(item.stdin),
          expected_output: encodeBase64(item.expectedOutput),
          cpu_time_limit: item.cpuTimeLimitSec,
          wall_time_limit: Math.max(item.cpuTimeLimitSec * 2, item.cpuTimeLimitSec + 1),
          memory_limit: item.memoryLimitKb,
          max_file_size: MAX_OUTPUT_KB,
          enable_network: false,
          callback_url: item.callbackUrl,
        })),
      }),
    },
  );

  const payload: unknown = await response.json();
  if (!Array.isArray(payload) || payload.length !== cases.length || !payload.every(isBatchToken)) {
    throw new Error('Judge0 returned an invalid batch response');
  }
  return payload;
}

export async function getJudge0Batch(tokens: string[]): Promise<Judge0Result[]> {
  if (tokens.length === 0) return [];

  const { apiUrl, headers } = requiredConfig();
  const query = new URLSearchParams({
    tokens: tokens.join(','),
    base64_encoded: 'true',
    fields: 'token,status,time,memory',
  });
  const response = await providerFetch(
    `${apiUrl}/submissions/batch?${query.toString()}`,
    { method: 'GET', headers },
  );

  const payload: unknown = await response.json();
  const submissions = (
    typeof payload === 'object'
    && payload !== null
    && Array.isArray((payload as { submissions?: unknown }).submissions)
  )
    ? (payload as { submissions: unknown[] }).submissions
    : null;

  if (!submissions || !submissions.every(isJudgeResult)) {
    throw new Error('Judge0 returned invalid submission results');
  }
  return submissions;
}
