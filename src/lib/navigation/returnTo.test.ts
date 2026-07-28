import { describe, expect, it } from 'vitest';
import {
  currentInternalRoute,
  encodeReturnTo,
  resolveReturnTo,
  validateReturnTo,
  withReturnTo,
} from './returnTo';

describe('safe return destinations', () => {
  it('accepts role-approved internal routes with query and hash', () => {
    expect(validateReturnTo('/problems?stage=1#chapter', 'student'))
      .toBe('/problems?stage=1#chapter');
    expect(validateReturnTo('/students?status=online', 'teacher'))
      .toBe('/students?status=online');
  });

  it('rejects external, protocol-relative, malformed, and forbidden routes', () => {
    expect(validateReturnTo('https://evil.example', 'student')).toBeNull();
    expect(validateReturnTo('//evil.example/path', 'student')).toBeNull();
    expect(validateReturnTo('/problems\u0000', 'student')).toBeNull();
    expect(validateReturnTo('/admin/problems', 'teacher')).toBeNull();
    expect(validateReturnTo('/students', 'student')).toBeNull();
    expect(validateReturnTo('/students', 'admin')).toBeNull();
  });

  it('uses a deterministic fallback', () => {
    expect(resolveReturnTo({
      candidate: '/admin/problems',
      role: 'student',
      fallback: '/problems',
    })).toBe('/problems');
  });

  it('builds and encodes internal return routes', () => {
    const route = currentInternalRoute({
      pathname: '/problems',
      search: 'stage=1&chapter=2',
    });
    expect(route).toBe('/problems?stage=1&chapter=2');
    expect(encodeReturnTo(route)).toBe('%2Fproblems%3Fstage%3D1%26chapter%3D2');
    expect(withReturnTo('/problems/123', route))
      .toBe('/problems/123?returnTo=%2Fproblems%3Fstage%3D1%26chapter%3D2');
  });
});
