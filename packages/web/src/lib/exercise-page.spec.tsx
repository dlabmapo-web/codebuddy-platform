import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ORPCError } from '@orpc/client';
import Page from '@/app/(studio)/academy/[academySlug]/learn/exercises/[materialId]/page';
const mocks=vi.hoisted(()=>({access:vi.fn(),bootstrap:vi.fn(),type:vi.fn()}));
vi.mock('@/lib/academy-route',()=>({requireAcademyRoute:mocks.access}));
vi.mock('@/lib/orpc-server',()=>({createServerORPCClient:()=>({learn:{getExerciseBootstrap:mocks.bootstrap,getMaterialType:mocks.type}}),getAccount:vi.fn()}));
vi.mock('next/navigation',()=>({redirect:(url:string)=>{throw new Error('REDIRECT:'+url);}}));
vi.mock('@/app/(studio)/academy/[academySlug]/learn/exercises/[materialId]/_components/workspace',()=>({Workspace:()=>null}));
vi.mock('@/app/(studio)/academy/[academySlug]/learn/exercises/[materialId]/_components/staff-workspace',()=>({StaffWorkspace:()=>null}));
vi.mock('@/components/studio/lesson-image-providers',()=>({ExerciseImageProvider:()=>null}));
vi.mock('@/app/(studio)/academy/[academySlug]/(framed)/learn/_components/learning-class-choice',()=>({LearningClassChoice:()=>null}));
vi.mock('@/components/workspace/material-read-failure',()=>({MaterialReadFailure:()=>null}));
vi.mock('@/i18n',()=>({PageTranslationsProvider:()=>null}));
vi.mock('@/i18n/init-translations',()=>({initTranslations:vi.fn()}));
vi.mock('@/i18n/server/get-locale',()=>({getLocale:vi.fn()}));
const materialId='10000000-0000-4000-8000-000000000001',classId='20000000-0000-4000-8000-000000000001';
const open=()=>Page({params:Promise.resolve({academySlug:'mapo',materialId}),searchParams:Promise.resolve({classId,mode:'student'})});
describe('exercise server entry',()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.access.mockResolvedValue({academyId:'academy'});mocks.type.mockResolvedValue({type:'PROGRAMMING_EXERCISE'});});
  it('propagates a failed bootstrap to the recovery boundary with its cause',async()=>{
    const failure=new ORPCError('INTERNAL_SERVER_ERROR',{status:500});mocks.bootstrap.mockRejectedValue(failure);
    await expect(open()).rejects.toBe(failure);
    expect(mocks.bootstrap).toHaveBeenCalledWith(expect.objectContaining({classId,mode:'student',materialId}));
  });
  it('does not mistake a failed material type request for an academy denial',async()=>{
    const failure=new Error('network');mocks.type.mockRejectedValue(failure);mocks.bootstrap.mockResolvedValue({});
    await expect(open()).rejects.toBe(failure);
  });
  it('shows a neutral activity state for an explicit content denial',async()=>{
    mocks.bootstrap.mockRejectedValue(new ORPCError('NOT_FOUND',{status:404,data:{code:'EXERCISE_NOT_AVAILABLE'}}));
    expect(await open()).toMatchObject({props:{unavailable:true,backHref:'/academy/mapo/learn/classes'}});
  });
  it('leaves the existing academy guard in charge of real membership failures',async()=>{
    const denial=new Error('ACADEMY GUARD');mocks.access.mockRejectedValue(denial);
    await expect(open()).rejects.toBe(denial);expect(mocks.bootstrap).not.toHaveBeenCalled();
  });
  it('redirects Turtle while settling its unused failed programming read',async()=>{
    mocks.type.mockResolvedValue({type:'TURTLE_EXERCISE'});mocks.bootstrap.mockRejectedValue(new Error('not programming'));
    await expect(open()).rejects.toThrow(`REDIRECT:/academy/mapo/learn/turtle/${materialId}?classId=${classId}`);
  });
});
