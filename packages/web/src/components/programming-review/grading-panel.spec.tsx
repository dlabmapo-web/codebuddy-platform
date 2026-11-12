// @vitest-environment happy-dom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {describe,expect,it,vi} from 'vitest';
import type {ProgrammingAssessment} from '@cove/shared';
import {ProgrammingGradingPanel} from './grading-panel';
const mocks=vi.hoisted(()=>({get:vi.fn(),publish:vi.fn()}));
vi.mock('@/lib/orpc',()=>({orpc:{teacherProgress:{getProgrammingReview:mocks.get,publishProgrammingReview:mocks.publish}}}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock('@/i18n',()=>({useLocale:()=> 'en'}));
vi.mock('@/i18n/client/use-error-text',()=>({useErrorText:()=>()=> 'error'}));
vi.mock('./use-review-translation',()=>({useReviewTranslation:()=> (key:string)=>key}));
vi.stubGlobal('React',React);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
const initial:ProgrammingAssessment={version:1,messageVersion:1,maximumHundredths:10000,includeInScore:false,
  state:'GRADED',reviewVersion:1,scoreHundredths:8000,completed:true,feedback:'Original feedback',reviewerName:'Teacher',reviewedAt:'2026-11-12T00:00:00.000Z'};
describe('teacher grading refresh',()=>{
  it.each(['card','sidebar'] as const)('reloads the current grade while preserving an unsaved correction (%s)',async(variant)=>{
    const host=document.createElement('div');document.body.append(host);const root=createRoot(host), dirty=vi.fn();
    mocks.get.mockResolvedValue({canPublishReview:true,assessment:{...initial,reviewVersion:2,scoreHundredths:9000},reviews:[]});
    try{
      await act(async()=>{root.render(<ProgrammingGradingPanel academyId="academy" classId="class" submissionId="submission" initial={initial} canPublish variant={variant} onDirtyChange={dirty}/>);});
      const input=host.querySelector('input[inputmode="decimal"]') as HTMLInputElement;
      expect(input.value).toBe('80');
      expect(dirty).toHaveBeenLastCalledWith(false);
      const button=[...host.querySelectorAll('button')].find(b=>b.textContent==='refresh'||b.getAttribute('aria-label')==='refresh')!;
      await act(async()=>{button.click();});
      expect(dirty).toHaveBeenLastCalledWith(true);
      expect(mocks.get).toHaveBeenCalledWith({academyId:'academy',classId:'class',submissionId:'submission'});
      expect(host.querySelector('[data-testid="programming-assessment"]')?.textContent).toContain('90 / 100');
      expect(input.value).toBe('80');
      expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Original feedback');
      if(variant==='sidebar') {
        const history=[...host.querySelectorAll('button')].find(b=>b.textContent==='history')!;
        await act(async()=>history.click());
        expect(host.querySelector('form')?.style.display).toBe('none');
        const back=[...host.querySelectorAll('button')].find(b=>b.textContent==='back_grading')!;
        await act(async()=>back.click());
        expect(host.querySelector('form')?.style.display).toBe('flex');
        expect(input.value).toBe('80');
        expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Original feedback');
        expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true); // correction reason is required
      }
    }finally{await act(async()=>root.unmount());host.remove();}
  });
});
