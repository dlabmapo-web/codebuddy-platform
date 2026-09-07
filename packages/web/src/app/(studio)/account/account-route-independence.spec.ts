import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/*
 * Both halves of My Page: the global route, and the sections it shares with
 * the academy-scoped one at `/academy/{slug}/me`. The shared half is the part
 * that matters most — it renders under a provider on one route and under none
 * on the other, so a hook reaching for the academy context would work in
 * testing and blank the global page in production.
 */
const roots = [
  fileURLToPath(new URL('.', import.meta.url)),
  fileURLToPath(
    new URL('../../../components/studio/profile/my-page/', import.meta.url),
  ),
];

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
  it('imports no academy route hook in the global route or the shared sections', () => {
    const offenders = roots
      .flatMap(sourceFiles)
      .filter((path) =>
        /useAcademySlug|academy-route-provider/.test(readFileSync(path, 'utf8')),
      );

    expect(offenders).toEqual([]);
  });
});
