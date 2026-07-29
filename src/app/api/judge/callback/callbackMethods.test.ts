import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Judge0 callback route methods', () => {
  it('routes both POST and PUT through the shared callback handler', () => {
    const source = readFileSync(
      new URL('./[callbackToken]/route.ts', import.meta.url),
      'utf8',
    );

    expect(source).toMatch(
      /export\s*\{\s*handleCallback\s+as\s+POST,\s*handleCallback\s+as\s+PUT,\s*\}/,
    );
  });
});
