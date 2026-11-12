// @vitest-environment happy-dom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {HistoryStatus} from './history-status';
vi.mock('react-i18next',()=>({useTranslation:()=>({t:(key:string)=>key})}));
vi.mock('@/components/programming-review/use-review-translation',()=>({useReviewTranslation:()=> (key:string)=>key}));
it('shows one graded state even for legacy incomplete values and preserves revision precedence',async()=>{
  vi.stubGlobal('React',React);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const host=document.createElement('div'),root=createRoot(host);
  try{
    await act(()=>root.render(<HistoryStatus status="in_progress" manualReview={{state:'GRADED',completed:false}}/>));
    expect(host.textContent).toContain('graded_short');expect(host.textContent).not.toContain('needs_work');expect(host.textContent).not.toContain('statuses.in_progress');
    await act(()=>root.render(<HistoryStatus status="completed" manualReview={{state:'GRADED',completed:true}}/>));
    expect(host.textContent).toContain('graded_short');expect(host.textContent).not.toContain('complete');
    await act(()=>root.render(<HistoryStatus status="pending" manualReview={{state:'AWAITING_REVIEW',completed:null}}/>));
    expect(host.textContent).toBe('history.statuses.pending');
    await act(()=>root.render(<HistoryStatus status="previous_revision" manualReview={{state:'GRADED',completed:true}}/>));
    expect(host.textContent).toBe('history.statuses.previous_revision');
    await act(()=>root.render(<HistoryStatus status="in_progress"/>));expect(host.textContent).toBe('history.statuses.in_progress');
  }finally{await act(()=>root.unmount());vi.unstubAllGlobals();}
});
