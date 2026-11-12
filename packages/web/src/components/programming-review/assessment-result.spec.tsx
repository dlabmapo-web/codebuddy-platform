// @vitest-environment happy-dom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, expect, it, vi} from 'vitest';
import type {ProgrammingAssessment} from '@cove/shared';
import {ProgrammingAssessmentResult} from './assessment-result';
vi.mock('@/i18n',()=>({useLocale:()=> 'en'}));
vi.mock('./use-review-translation',()=>({useReviewTranslation:()=> (key:string)=>key}));
afterEach(()=>vi.unstubAllGlobals());
const graded:ProgrammingAssessment={version:1,messageVersion:1,maximumHundredths:10000,includeInScore:false,state:'GRADED',reviewVersion:1,scoreHundredths:7925,completed:false,feedback:'Check the stopping condition.',reviewerName:'Teacher',reviewedAt:'2026-11-12T00:00:00.000Z'};
it.each([false,true])('gives state-specific next steps and preserves scores/feedback (dark=%s)',async(dark)=>{
  vi.stubGlobal('React',React);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const host=document.createElement('div'),root=createRoot(host),refresh=vi.fn();
  const render=async(assessment?:ProgrammingAssessment)=>act(()=>root.render(<ProgrammingAssessmentResult assessment={assessment} dark={dark} onRefresh={refresh}/>));
  try {
    await render({...graded,state:'AWAITING_REVIEW',reviewVersion:0,scoreHundredths:null,completed:null});
    expect(host.textContent).toContain('notice');expect(host.textContent).toContain('talk_teacher_pending_help');
    expect(host.querySelector('[data-testid="assessment-score"]')).toBeNull();
    await render(graded);
    expect(host.querySelector('[data-testid="assessment-score"]')?.textContent).toBe('79.25 / 100');
    expect(host.textContent).toContain('needs_work');expect(host.textContent).toContain(graded.feedback);
    expect(host.textContent).toContain('needs_work_next_help');expect(host.textContent).not.toContain('notice');
    await act(()=>host.querySelector('button')!.click());expect(refresh).toHaveBeenCalledOnce();
    await render({...graded,completed:true,scoreHundredths:0,feedback:''});
    expect(host.querySelector('[data-testid="assessment-score"]')?.textContent).toBe('0 / 100');
    expect(host.textContent).toContain('complete_next_help');expect(host.textContent).toContain('no_feedback');
    expect(host.textContent).not.toContain('needs_work');
    await render();expect(host.textContent).toBe('practice');expect(host.querySelector('button')).toBeNull();
  } finally {await act(()=>root.unmount());}
});
