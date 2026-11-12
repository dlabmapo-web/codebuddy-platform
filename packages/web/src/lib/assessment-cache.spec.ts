import {describe,expect,it} from 'vitest';
import {assessmentCacheMatches} from './assessment-cache';
describe('assessment cache scope',()=>{
  it('refreshes learning and work history only in the named academy',()=>{
    expect(assessmentCacheMatches(['learn','academy','records'],'academy')).toBe(true);
    expect(assessmentCacheMatches(['student-history','nonce','academy','class'],'academy')).toBe(true);
    expect(assessmentCacheMatches(['academy','academy','live-submission-review'],'academy')).toBe(true);
    expect(assessmentCacheMatches(['learn','another','records'],'academy')).toBe(false);
    expect(assessmentCacheMatches(['notifications','academy'],'academy')).toBe(false);
  });
});
