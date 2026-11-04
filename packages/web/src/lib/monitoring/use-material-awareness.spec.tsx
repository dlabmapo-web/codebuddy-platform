// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useMaterialAwareness } from './use-material-awareness';
import { HistoryPresentationContext } from './history-presentation';
const setup = vi.hoisted(() => {
  const emit = vi.fn();
  return { emit, socket: { connected: true, volatile: { emit }, emit, on: vi.fn(), off: vi.fn() } };
});
it('clears the shared pointer while historical work is covered and resumes without remounting the session', async () => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host=document.createElement('div'); document.body.append(host); const root=createRoot(host);
  const paper=document.createElement('div'); document.body.append(paper); paper.dataset.collabSurface='pdf';
  paper.getBoundingClientRect=()=>({left:0,top:0,width:400,height:400} as DOMRect);
  function Capture(){useMaterialAwareness({enabled:true,materialId:'material',classId:'class'});return null;}
  function Harness({covered}:{covered:boolean}){return <HistoryPresentationContext.Provider value={{covered,setConnection:()=>{},open:()=>{},revoke:()=>{},setMaterial:()=>{}}}><Capture/></HistoryPresentationContext.Provider>;}
  try {
    await act(()=>root.render(<Harness covered={false}/>));
    paper.dispatchEvent(new PointerEvent('pointermove',{clientX:100,clientY:100,bubbles:true}));await act(()=>vi.advanceTimersByTimeAsync(80));
    expect(setup.emit).toHaveBeenLastCalledWith('observation.awareness',expect.objectContaining({pointer:expect.objectContaining({x:0.25})}));
    await act(()=>root.render(<Harness covered/>));
    expect(setup.emit).toHaveBeenLastCalledWith('observation.awareness',expect.objectContaining({pointer:null}));
    const sent=setup.emit.mock.calls.length;
    paper.dispatchEvent(new PointerEvent('pointermove',{clientX:200,clientY:200,bubbles:true}));await act(()=>vi.advanceTimersByTimeAsync(1000));expect(setup.emit).toHaveBeenCalledTimes(sent);
    await act(()=>root.render(<Harness covered={false}/>));
    paper.dispatchEvent(new PointerEvent('pointermove',{clientX:200,clientY:200,bubbles:true}));await act(()=>vi.advanceTimersByTimeAsync(80));
    expect(setup.emit).toHaveBeenLastCalledWith('observation.awareness',expect.objectContaining({pointer:expect.objectContaining({x:0.5})}));
  } finally { await act(()=>root.unmount());host.remove();paper.remove(); }
});
vi.mock('./student-presence', () => ({ useStudentPresence: () => ({ socket: setup.socket, academyId: 'academy' }) }));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
it('holds the last point through idle, blur and unsupported areas, and clears on material teardown', async () => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const paper = document.createElement('div'); document.body.append(paper); paper.dataset.collabSurface = 'pdf';
  paper.getBoundingClientRect = () => ({ left: 100, top: 200, width: 400, height: 800 } as DOMRect);
  function Harness() { useMaterialAwareness({ enabled: true, materialId: 'material', classId: 'class' }); return null; }
  try {
    await act(() => root.render(<Harness />));
    paper.dispatchEvent(new PointerEvent('pointermove', { clientX: 200, clientY: 400, bubbles: true }));
    await act(() => vi.advanceTimersByTimeAsync(80));
    expect(setup.emit).toHaveBeenLastCalledWith('observation.awareness', expect.objectContaining({ pointer: expect.objectContaining({ x: 0.25, y: 0.25, surface: 'pdf' }) }));
    const sent = setup.emit.mock.calls.length;
    window.dispatchEvent(new Event('blur')); document.dispatchEvent(new Event('visibilitychange'));
    document.dispatchEvent(new Event('pointerleave'));
    document.body.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    await act(() => vi.advanceTimersByTimeAsync(10000));
    expect(setup.emit).toHaveBeenCalledTimes(sent);
    await act(() => root.unmount());
    expect(setup.emit).toHaveBeenLastCalledWith('observation.awareness', expect.objectContaining({ focus: null, pointer: null, editor: null }));
  } finally { paper.remove(); host.remove(); }
});
