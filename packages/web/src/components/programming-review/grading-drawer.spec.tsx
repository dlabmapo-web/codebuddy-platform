// @vitest-environment happy-dom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, expect, it, vi} from 'vitest';
import {ProgrammingGradingDrawer, type GradingSnapshot} from './grading-drawer';

const setup = vi.hoisted(() => ({dirty: null as null | ((value:boolean)=>void), saving: null as null | ((value:boolean)=>void), closeFocus: null as null | ((event:Event)=>void)}));
const SheetState = React.createContext({open:false, onOpenChange: (()=>{}) as (value:boolean)=>void});
vi.mock('@/components/studio/primitives', () => ({
  Sheet: ({open, onOpenChange, children}: React.PropsWithChildren<{open:boolean;onOpenChange:(value:boolean)=>void}>) => <SheetState.Provider value={{open,onOpenChange}}>{children}</SheetState.Provider>,
  SheetTrigger: ({children}: React.PropsWithChildren) => {const sheet=React.useContext(SheetState);return <button onClick={()=>sheet.onOpenChange(true)}>{children}</button>;},
  SheetContent: ({children,onCloseAutoFocus}: React.PropsWithChildren<{onCloseAutoFocus:(event:Event)=>void}>) => {setup.closeFocus=onCloseAutoFocus;return React.useContext(SheetState).open ? <div role="dialog">{children}</div> : null;},
}));
vi.mock('@/i18n', () => ({useLocale:()=> 'en'}));
vi.mock('./use-review-translation', () => ({useReviewTranslation:()=> (key:string)=>key}));
vi.mock('./grading-panel', () => ({ProgrammingGradingPanel: ({submissionId,onDirtyChange,onSavingChange}:{submissionId:string;onDirtyChange:(value:boolean)=>void;onSavingChange:(value:boolean)=>void}) => {
  setup.dirty=onDirtyChange;setup.saving=onSavingChange;
  React.useEffect(()=>{onDirtyChange(false);onSavingChange(false);return ()=>{onDirtyChange(false);onSavingChange(false);};},[onDirtyChange,onSavingChange]);
  return <div data-testid="target">{submissionId}</div>;
}}));
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
const original:GradingSnapshot={submissionId:'first',materialId:'material',membershipId:'student',studentName:'Alice',problemTitle:'Loop game',createdAt:'2026-11-12T00:00:00Z',code:'print("submitted, not live")',canPublishManualReview:true,
  manualAssessment:{version:1,messageVersion:1,maximumHundredths:10000,includeInScore:false,state:'AWAITING_REVIEW',reviewVersion:0,scoreHundredths:null,completed:null,feedback:'',reviewerName:null,reviewedAt:null}};
async function mount(review=original) {
  vi.stubGlobal('React',React);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  let guard:(()=>boolean)|null=null;
  const register=(next:(()=>boolean)|null)=>{guard=next;};
  const render=async(value:GradingSnapshot|null)=>{await act(()=>root.render(<ProgrammingGradingDrawer academyId="academy" classId="class" review={value} onRegisterGuard={register}/>));};
  await render(review);
  const click=async(text:string)=>act(()=>[...host.querySelectorAll('button')].find(button=>button.textContent===text || button.getAttribute('aria-label')===text)!.click());
  return {host,render,click,leave:()=>guard?.(),dispose:async()=>{await act(()=>root.unmount());host.remove();}};
}
it('pins the opened saved code and submission, with a guarded switch to a newer receipt',async()=>{
  const view=await mount();
  try{
    await view.click('grade_submission');
    expect(view.host.querySelector('[data-testid="target"]')?.textContent).toBe('first');
    await view.render({...original,submissionId:'second',code:'print("newer")'});
    expect(view.host.textContent).toContain('newer_submission');
    expect(view.host.querySelector('[data-testid="grading-submitted-code"]')?.textContent).toBe(original.code);
    setup.dirty?.(true);
    vi.stubGlobal('confirm',vi.fn().mockReturnValue(false)); const confirm=vi.mocked(window.confirm);
    await view.click('grade_latest');
    expect(confirm).toHaveBeenCalledWith('unsaved_grade');
    expect(view.host.querySelector('[data-testid="target"]')?.textContent).toBe('first');
    confirm.mockReturnValue(true);
    await view.click('grade_latest');
    expect(view.host.querySelector('[data-testid="target"]')?.textContent).toBe('second');
    expect(view.host.querySelector('[data-testid="grading-submitted-code"]')?.textContent).toBe('print("newer")');
  }finally{await view.dispose();}
});
it('blocks close/navigation during publication and protects unsaved edits',async()=>{
  const view=await mount();
  try{
    await view.click('grade_submission');setup.saving?.(true);
    expect(view.leave()).toBe(false);
    await view.click('close_grading');expect(view.host.querySelector('[role="dialog"]')).not.toBeNull();
    setup.saving?.(false);setup.dirty?.(true);vi.stubGlobal('confirm',vi.fn().mockReturnValue(false));
    expect(view.leave()).toBe(false);
    vi.mocked(window.confirm).mockReturnValue(true);
    await act(()=>{expect(view.leave()).toBe(true);});
    expect(view.host.querySelector('[role="dialog"]')).toBeNull();
  }finally{await view.dispose();}
});
it('offers no grading action without the authorized publication capability',async()=>{
  const view=await mount({...original,canPublishManualReview:false});
  try{expect(view.host.querySelector('button')).toBeNull();expect(view.host.querySelector('[role="dialog"]')).toBeNull();}finally{await view.dispose();}
});

it('preserves focus chosen outside the sidebar during its closing animation',async()=>{
  const view=await mount(), next=document.createElement('button');document.body.append(next);
  try{
    await view.click('grade_submission');next.focus();
    expect(document.activeElement).toBe(next);
    const close=new Event('closeAutoFocus',{cancelable:true});setup.closeFocus?.(close);
    expect(close.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(next);
  }finally{next.remove();await view.dispose();}
});
