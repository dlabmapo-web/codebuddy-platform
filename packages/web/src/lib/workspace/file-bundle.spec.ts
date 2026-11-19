import { decodeFileBundle, encodeFileBundle, exerciseProjectIssues } from '@cove/shared';
import { describe, expect, it } from 'vitest';

import { coerceToBundle, projectTemplate } from './file-bundle';

const starter = encodeFileBundle([
  { path: 'sum.h', content: 'int sum(int, int);' },
  { path: 'main.c', content: 'int main(void) {}' },
]);

describe('coerceToBundle', () => {
  it('keeps old single-file work as the first source', () => {
    const files = decodeFileBundle(coerceToBundle('int main(void) { return 7; }', starter))!;
    expect(files.find((file) => file.path === 'main.c')?.content).toBe('int main(void) { return 7; }');
    expect(files.find((file) => file.path === 'sum.h')?.content).toBe('int sum(int, int);');
  });
  it('passes bundles and single-file problems through', () => {
    expect(coerceToBundle(starter, starter)).toBe(starter);
    expect(coerceToBundle('x', 'y')).toBe('x');
    expect(coerceToBundle('  ', starter)).toBe(starter);
  });
});

describe('projectTemplate', () => {
  it.each(['C', 'CPP'] as const)('is a valid %s project', (language) => {
    expect(exerciseProjectIssues(projectTemplate(language), language)).toEqual([]);
  });
});
