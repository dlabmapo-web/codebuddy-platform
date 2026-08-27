import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const accountRoot = fileURLToPath(new URL('.', import.meta.url));

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry) && !/\.spec\.tsx?$/.test(entry) ? [path] : [];
  });
}

/*
 * My Page is reached at /account, outside `academy/[academySlug]`, so the
 * academy route provider is not mounted above it. `useAcademySlug` throws
 * rather than returning null, which turned one such import into a blank page
 * for every signed-in person with a membership.
 *
 * The slug the academy zone needs is already on the selected membership, so
 * it travels as a prop. This keeps the whole subtree honest about that.
 */
describe('My Page does not depend on the academy route context', () => {
  it('imports no academy route hook anywhere under /account', () => {
    const offenders = sourceFiles(accountRoot).filter((path) =>
      /useAcademySlug|academy-route-provider/.test(readFileSync(path, 'utf8')),
    );

    expect(offenders).toEqual([]);
  });
});
