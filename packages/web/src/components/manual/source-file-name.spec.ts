import { describe, expect, it } from 'vitest';
import { sourceFileNameError } from './source-file-name';
describe('new Python source files', () => {
  it('accepts modules and nested source without changing existing files', () => {
    expect(sourceFileNameError('shapes/square.py', { 'main.py': '' })).toBeNull();
    expect(sourceFileNameError('main.py', { 'main.py': '' })).toBe('file_duplicate');
    expect(sourceFileNameError('main.py/helper.py', { 'main.py': '' })).toBe('file_invalid');
  });
  it('rejects traversal, reserved paths, unsupported files and quota overflow', () => {
    for (const name of ['', '/a.py', '../a.py', 'x/../a.py', 'assets/a.py', 'x//a.py', 'hello.txt']) expect(sourceFileNameError(name, {})).toBe('file_invalid');
    expect(sourceFileNameError('new.py', Object.fromEntries(Array.from({ length: 64 }, (_, i) => [`m${i}.py`, ''])))).toBe('file_limit');
  });
});
