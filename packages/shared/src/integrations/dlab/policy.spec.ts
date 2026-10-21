import { describe, expect, it } from 'vitest';
import { canonicalDlabScope, dlabAcademyRole, dlabPlatformRole, dlabEffectiveScope, validDlabAuthorizeUrl } from './policy.js';
describe('DLAB trust policy', () => {
  it.each([['student', 'STUDENT'], ['instructor', 'TEACHER'], ['edu_manager', 'TEAM_LEAD'], ['lab_head', 'MANAGER'], ['tutor', 'TEACHER'], ['so_staff', 'STUDENT'], ['hq_admin', null], ['future_admin', 'STUDENT']])('maps %s to %s', (input, output) => expect(dlabAcademyRole(input!)).toBe(output));
  it.each(['student', 'instructor', 'tutor', 'edu_manager', 'lab_head', 'so_staff', 'HQ_ADMIN', 'future_admin'])('never gives platform admin to %s', role => expect(dlabPlatformRole(role)).toBe('USER'));
  it('recognizes only the exact verified HQ role as platform admin', () => expect(dlabPlatformRole('hq_admin')).toBe('ADMIN'));
  it('canonicalizes without inferring missing primary scope', () => {
    expect(canonicalDlabScope('a', ['b', 'b', 'c'])).toEqual(['b', 'c']);
    expect(dlabEffectiveScope('instructor', 'a', ['c', 'b', 'b'])).toEqual(['b', 'c']);
    expect(dlabEffectiveScope('instructor', 'a')).toEqual(['a']);
    expect(dlabEffectiveScope('instructor', 'a', [])).toEqual([]);
    expect(dlabEffectiveScope('tutor', 'a', ['b', 'c', 'b'])).toEqual(['b', 'c']);
    expect(dlabEffectiveScope('tutor', 'a', [])).toEqual([]);
    expect(dlabEffectiveScope('student', 'a', ['a', 'b'])).toEqual([]);
    expect(dlabEffectiveScope('student', 'a', ['b'])).toEqual([]);
    expect(dlabEffectiveScope('future_admin', 'a', ['a', 'b'])).toEqual(['a']);
    expect(dlabEffectiveScope('hq_admin', 'a', ['b'])).toEqual(['b']);
    expect(dlabEffectiveScope('hq_admin', 'a', [])).toEqual([]);
  });
  it.each(['https://dlab-os.onrender.com/v1/sso/authorize', 'https://os.dlabcampus.com.evil.test/v1/sso/authorize', 'http://os.dlabcampus.com/v1/sso/authorize', 'https://secret@os.dlabcampus.com/v1/sso/authorize', 'https://os.dlabcampus.com/v1/sso/authorize#secret', 'https://os.dlabcampus.com/authorize'])('rejects untrusted authorize URL %s', url => expect(validDlabAuthorizeUrl(url)).toBe(false));
  it('accepts only the new fixed authorize endpoint', () => expect(validDlabAuthorizeUrl('https://os.dlabcampus.com/v1/sso/authorize?client_id=cove&state=opaque')).toBe(true));
});
