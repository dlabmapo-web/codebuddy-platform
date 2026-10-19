import { describe, expect, it } from 'vitest';
import { dlabSsoUserSchema, safeDlabReturnTo } from './contract.js';
describe('DLAB contract boundaries', () => {
  it.each(['https://evil.test', '//evil.test', '/academy/test/../admin', '/academy/test/%2f%2fevil', '/academy/test?next=evil', '/academy/test\\evil', '/login', '/academy/test\n'])('rejects unsafe return path %j', value => expect(safeDlabReturnTo(value)).toBeNull());
  it('accepts a plain academy path', () => expect(safeDlabReturnTo('/academy/dlab-mapo/learn/courses')).toBe('/academy/dlab-mapo/learn/courses'));
  it('retains unknown roles and non-UUID IDs without accepting unknown status', () => {
    const payload = { external_user_id: 'student_01', external_campus_id: 'campus_01', name: 'Test', user_role: 'future_role', account_status: 'active' };
    expect(dlabSsoUserSchema.parse(payload).user_role).toBe('future_role');
    expect(dlabSsoUserSchema.safeParse({ ...payload, account_status: 'unknown' }).success).toBe(false);
  });
});
