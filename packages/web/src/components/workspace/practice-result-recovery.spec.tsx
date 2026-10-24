// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { usePracticeSubmission } from '@/app/(studio)/academy/[academySlug]/learn/exercises/[materialId]/_hooks/use-practice-submission';
const rpc = vi.hoisted(() => ({ getLatestSubmission: vi.fn(), getPracticeResult: vi.fn(), listPracticeAttempts: vi.fn(), submitPractice: vi.fn() }));
vi.mock('@/lib/orpc', () => ({ orpc: { learn: rpc } }));
vi.stubGlobal('React', React);
vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
const pause = (ms:number) => new Promise(resolve => setTimeout(resolve, ms));
it('stops automatic polling after the budget and recovers a terminal result on focus', async () => {
 let current = Date.now(), status = 'RUNNING';
 const now = vi.spyOn(Date, 'now').mockImplementation(() => current);
 rpc.getLatestSubmission.mockResolvedValue(null);
 rpc.listPracticeAttempts.mockResolvedValue({attempts:[]});
 rpc.submitPractice.mockResolvedValue({submissionId:'attempt',totalCount:1});
 rpc.getPracticeResult.mockImplementation(async () => ({submissionId:'attempt',status,cases:[],totalCount:1}));
 const client = new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false,gcTime:Infinity}}});
 const host=document.createElement('div');document.body.appendChild(host);const root=createRoot(host);
 let state:ReturnType<typeof usePracticeSubmission>;
 function Probe(){state=usePracticeSubmission('academy','material',false,1,true,'owner');return null;}
 try {
  await act(async()=>{root.render(<QueryClientProvider client={client}><Probe/></QueryClientProvider>);await pause(10);});
  await act(async()=>{await state!.submit('print("hello")');await pause(50);});
  expect(state!.submitting).toBe(true);
  await act(async()=>{current+=121000;await pause(1100);});
  const bounded=rpc.getPracticeResult.mock.calls.length;
  await act(async()=>{await pause(1200);});
  expect(rpc.getPracticeResult).toHaveBeenCalledTimes(bounded);
  status='ERRORED';
  await act(async()=>{focusManager.setFocused(false);focusManager.setFocused(true);await pause(50);});
  expect(rpc.getPracticeResult.mock.calls.length).toBeGreaterThan(bounded);
  expect(state!.submitting).toBe(false);
  expect(state!.result?.status).toBe('ERRORED');
 } finally {
  await act(async()=>root.unmount());client.clear();host.remove();focusManager.setFocused(undefined);now.mockRestore();
 }
},10000);
