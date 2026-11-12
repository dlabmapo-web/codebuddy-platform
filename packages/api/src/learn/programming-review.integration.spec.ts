import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigService } from '@nestjs/config';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '../generated/prisma/client.js';
import type { PrismaService } from '../database/prisma.service.js';
import type { SupabaseIdentity } from '../auth/auth.types.js';
import { AcademyAccessService } from '../authorization/academy-access.service.js';
import { SupportGrantResolver } from '../authorization/support-grant.resolver.js';
import { AuditService } from '../academies/audit.service.js';
import type { MonitoringRevocationService } from '../monitoring/monitoring-revocation.service.js';
import type { JudgeQueue } from '../judge/judge.queue.js';
import { SubmissionService } from './submission.service.js';
import { ProgrammingReviewService } from './programming-review.service.js';
import { StaffPracticeService } from './staff-practice.service.js';
import { LearningClassContextService } from './learning-class-context.service.js';
import { CurriculumOutlineService } from './curriculum-outline.service.js';
import { LearnService } from './learn.service.js';
import { AnswerRecordsService } from './answer-records.service.js';
import { TeacherProgressAccessService } from '../teach/teacher-progress-access.service.js';
import { TeacherProgressRepository } from '../teach/teacher-progress.repository.js';
import { TeacherProgressService } from '../teach/teacher-progress.service.js';
import { StudentWorkHistoryService } from '../teach/student-work-history.service.js';
import { readClassHistoryMaterials } from './curriculum-read.js';
import { readSubmissionAdmission } from './submission-admission-read.js';
import { SampleCheckService } from './sample-check.service.js';
import { automaticLatestSubmission } from './latest-submission.js';

const url = process.env.COVE_INTEGRATION_DATABASE_URL;
describe.skipIf(!url)('manual programming assessment on disposable PostgreSQL', () => {
  const academyId=randomUUID(), courseId=randomUUID(), lectureId=randomUUID(), classId=randomUUID(), materialId=randomUUID();
  const people = Object.fromEntries(['student','teacher','assistant','lead','manager','stranger'].map(name => [name,{id:randomUUID(), auth:randomUUID(), membership:randomUUID()}]));
  const createClient = () => new PrismaClient({adapter:new PrismaPg({connectionString:url!}),log:[{emit:"event",level:"query"}]});
  let db: ReturnType<typeof createClient>, prisma: PrismaService, submit: SubmissionService, review: ProgrammingReviewService,
    practice: StaffPracticeService, outline: CurriculumOutlineService, learn: LearnService, records: AnswerRecordsService,
    teacher: TeacherProgressService, history: StudentWorkHistoryService;
  let sqlCount=0;
  let statements: string[]=[];
  const counts: Record<string, unknown> = {};
  const queue = {enqueue: vi.fn(), enqueuePractice: vi.fn(), consumeSubmissionToken: vi.fn().mockResolvedValue(true)};
  const events = {publishProgrammingAssessment: vi.fn()};
  const identity = (name: string) => ({authUserId: people[name]!.auth} as SupabaseIdentity);
  const request = (code='print("manual")') => ({academyId,classId,materialId,code,requestId:randomUUID(),manualAssessmentVersion:1 as const});
  const grade = (submissionId: string, overrides = {}) => ({academyId,classId,submissionId,expectedVersion:0,requestId:randomUUID(),scoreHundredths:8000,completed:true,feedback:'Use a while loop.',reason:'',...overrides});
  beforeAll(async () => {
    if (!['localhost','127.0.0.1'].includes(new URL(url!).hostname)) throw new Error('Disposable local PostgreSQL required');
    db = createClient();
    db.$on('query',event=>{sqlCount++;statements.push(event.query);}); prisma=db as unknown as PrismaService;
    const org=await db.organization.create({data:{name:'Manual fixture',slug:`manual-${academyId}`}});
    await db.academy.create({data:{id:academyId,organizationId:org.id,name:'Manual fixture',slug:`manual-${academyId}`,status:'ACTIVE'}});
    await db.user.createMany({data:Object.entries(people).map(([name,p])=>({id:p.id,authUserId:p.auth,displayName:name,status:'ACTIVE' as const}))});
    await db.academyMembership.createMany({data:Object.entries(people).map(([name,p])=>({id:p.membership,userId:p.id,academyId,status:'ACTIVE' as const,
      role:name==='student'?'STUDENT' as const:name==='manager'?'MANAGER' as const:name==='lead'?'TEAM_LEAD' as const:'TEACHER' as const}))});
    await db.course.create({data:{id:courseId,academyId,createdByUserId:people.manager!.id,title:'Manual programming',isVisible:true,
      modules:{create:{externalKey:'module',title:'Module',position:1,isVisible:true,
        lectures:{create:{id:lectureId,externalKey:'lecture',title:'Lecture',position:1,isVisible:true,
          materials:{create:{id:materialId,type:'PROGRAMMING_EXERCISE',title:'Rock paper scissors',position:1,isVisible:true,
            programmingExercise:{create:{externalKey:'manual',difficulty:'EASY',submissionPolicy:'MANUAL_REVIEW',manualIncludeInScore:true}}}}}}}}}});
    await db.class.create({data:{id:classId,academyId,name:'Manual class',createdByUserId:people.manager!.id,teacherMembershipId:people.teacher!.membership,
      assistantTeachers:{create:{membershipId:people.assistant!.membership}},
      courseAssignments:{create:{courseId,assignedByUserId:people.manager!.id}},
      enrollments:{create:{membershipId:people.student!.membership,enrolledByUserId:people.manager!.id}}}});
    const access=new AcademyAccessService(prisma,new SupportGrantResolver(prisma));
    const classes=new LearningClassContextService(prisma);
    submit=new SubmissionService(prisma,access,new ConfigService({SUBMISSION_RATE_LIMIT:10000}),classes,queue as unknown as JudgeQueue);
    review=new ProgrammingReviewService(prisma,access,new AuditService(),events as unknown as MonitoringRevocationService);
    practice=new StaffPracticeService(prisma,access,new ConfigService({SUBMISSION_RATE_LIMIT:10000}),queue as unknown as JudgeQueue);
    outline=new CurriculumOutlineService(prisma);
    learn=new LearnService(prisma,{} as never,access,outline,submit,classes,practice);
    records=new AnswerRecordsService(prisma,access);
    const teacherAccess=new TeacherProgressAccessService(prisma,access), repo=new TeacherProgressRepository(prisma);
    teacher=new TeacherProgressService(teacherAccess,repo);
    history=new StudentWorkHistoryService(prisma,teacherAccess,repo,teacher);
  },30000);
  afterAll(async()=>{if(process.env.COVE_MANUAL_EVIDENCE_PATH) await writeFile(process.env.COVE_MANUAL_EVIDENCE_PATH,JSON.stringify(counts,null,2)+'\n');await db?.$disconnect();});

  it('records code without a grader, no cases and no fabricated score; duplicate requests consume one token',async()=>{
    queue.consumeSubmissionToken.mockClear();
    const input=request(); const [a,b]=await Promise.all([submit.submit(identity('student'),input),submit.submit(identity('student'),input)]);
    expect(a.submissionId).toBe(b.submissionId); expect(queue.consumeSubmissionToken).toHaveBeenCalledTimes(1);
    expect(a.result).toMatchObject({status:'RECORDED',score:null,totalCount:0,manualAssessment:{state:'AWAITING_REVIEW',scoreHundredths:null}});
    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(await db.submissionGradingCase.count({where:{submissionId:a.submissionId}})).toBe(0);
    const row=await db.submission.findUniqueOrThrow({where:{id:a.submissionId}});
    expect(row).toMatchObject({code:input.code,score:null,status:'RECORDED',executionQueue:null,gradedAt:null});
    expect(automaticLatestSubmission(row)).toMatchObject({status:'AWAITING_REVIEW',scoreHundredths:null});
    await expect(submit.submit(identity('student'),{...input,code:'different'})).rejects.toThrow();
  });
  it.each(['teacher','assistant','lead','manager'])('%s publishes a grade under the existing class inheritance policy',async name=>{
    const accepted=await submit.submit(identity('student'),request(name));
    const result=await review.publish(identity(name),grade(accepted.submissionId));
    expect(result.assessment).toMatchObject({state:'GRADED',scoreHundredths:8000,completed:true,reviewerName:name,reviewVersion:1});
    expect(await submit.get(identity('student'),{academyId,submissionId:accepted.submissionId})).toMatchObject({score:null,manualAssessment:{scoreHundredths:8000}});
    expect((await db.submission.findUniqueOrThrow({where:{id:accepted.submissionId}})).score).toBeNull();
  });
  it('denies an unassigned Teacher, students and wrong class identifiers',async()=>{
    const accepted=await submit.submit(identity('student'),request());
    for(const name of ['stranger','student']) await expect(review.publish(identity(name),grade(accepted.submissionId))).rejects.toThrow();
    await expect(review.publish(identity('manager'),grade(accepted.submissionId,{classId:randomUUID()}))).rejects.toThrow();
    expect(await db.programmingSubmissionReview.count({where:{submissionId:accepted.submissionId}})).toBe(0);
  });
  it('permits lead/manager grading without an assigned teacher and rejects archived classes',async()=>{
    const accepted=await submit.submit(identity('student'),request());
    await db.class.update({where:{id:classId},data:{teacherMembershipId:null}});
    expect((await review.publish(identity('lead'),grade(accepted.submissionId))).assessment.reviewVersion).toBe(1);
    await db.class.update({where:{id:classId},data:{status:'ARCHIVED'}});
    await expect(review.publish(identity('manager'),grade(accepted.submissionId,{expectedVersion:1,reason:'Correct'}))).rejects.toThrow();
    await db.class.update({where:{id:classId},data:{status:'ACTIVE',teacherMembershipId:people.teacher!.membership}});
  });
  it('preserves review versions, exact zero, reason and idempotent replay after later corrections',async()=>{
    const accepted=await submit.submit(identity('student'),request());
    await expect(review.publish(identity('teacher'),grade(accepted.submissionId,{scoreHundredths:10001}))).rejects.toThrow();
    const first=grade(accepted.submissionId,{scoreHundredths:0,completed:false});
    expect((await review.publish(identity('teacher'),first)).assessment.scoreHundredths).toBe(0);
    const corrected=await review.publish(identity('lead'),grade(accepted.submissionId,{expectedVersion:1,scoreHundredths:9012,reason:'Partial-credit correction'}));
    expect(corrected.reviews.map(r=>r.scoreHundredths)).toEqual([9012,0]);
    expect(corrected.reviews[0]).toMatchObject({previousScoreHundredths:0,deltaHundredths:9012,reason:'Partial-credit correction'});
    expect((await review.publish(identity('teacher'),first)).assessment.scoreHundredths).toBe(0);
    await expect(review.publish(identity('teacher'),{...first,scoreHundredths:1})).rejects.toThrow();
    await expect(review.publish(identity('teacher'),grade(accepted.submissionId,{expectedVersion:2,reason:'',scoreHundredths:10001}))).rejects.toThrow();
  });
  it('serializes concurrent reviewers and checks revocation on publication',async()=>{
    const accepted=await submit.submit(identity('student'),request());
    const results=await Promise.allSettled(['teacher','manager'].map(name=>review.publish(identity(name),grade(accepted.submissionId))));
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    await db.academyMembership.update({where:{id:people.lead!.membership},data:{status:'SUSPENDED'}});
    await expect(review.publish(identity('lead'),grade(accepted.submissionId,{expectedVersion:1,reason:'Changed'}))).rejects.toThrow();
    await db.academyMembership.update({where:{id:people.lead!.membership},data:{status:'ACTIVE'}});
  });
  it('keeps staff receipts private and out of review endpoints, without grading jobs',async()=>{
    const accepted=await practice.submit(identity('manager'),{academyId,materialId,code:'private',requestId:randomUUID()});
    expect(accepted.result).toMatchObject({status:'RECORDED',score:null,manualAssessment:null});
    await expect(review.get(identity('manager'),{academyId,classId,submissionId:accepted.submissionId})).rejects.toThrow();
    expect(queue.enqueuePractice).not.toHaveBeenCalled();
    expect(await practice.latest(identity('manager'),{academyId,materialId})).toMatchObject({status:'RECORDED',scoreHundredths:null});
  });
  it('reports grading separately from completion in history without changing completed totals',async()=>{
    const accepted=await submit.submit(identity('student'),request('history outcome'));
    const read=()=>history.listStudentMaterials(identity('manager'),{academyId,classId,membershipId:people.student!.membership,page:1});
    expect((await read()).rows.find(row=>row.materialId===materialId)).toMatchObject({status:'pending',manualReview:{state:'AWAITING_REVIEW',completed:null}});
    await review.publish(identity('teacher'),grade(accepted.submissionId,{scoreHundredths:10000,completed:false}));
    let rows=(await read()).rows;
    expect(rows.find(row=>row.materialId===materialId)).toMatchObject({status:'in_progress',score:100,manualReview:{state:'GRADED',completed:false}});
    expect(rows.find(row=>row.materialId===materialId)?.lectureCompleted).toBe(0);
    await review.publish(identity('manager'),grade(accepted.submissionId,{expectedVersion:1,scoreHundredths:10000,completed:true,reason:'Learning is complete'}));
    rows=(await read()).rows;
    expect(rows.find(row=>row.materialId===materialId)).toMatchObject({status:'completed',manualReview:{state:'GRADED',completed:true}});
    expect(rows.find(row=>row.materialId===materialId)?.lectureCompleted).toBe(1);
  });
  it('uses newest submission for pending/graded summaries and excluded course totals',async()=>{
    const accepted=await submit.submit(identity('student'),request()); await review.publish(identity('teacher'),grade(accepted.submissionId));
    const newer=await submit.submit(identity('student'),request('new code'));
    expect(await learn.getLatestSubmission(identity('student'),{academyId,materialId,classId,mode:'student'})).toMatchObject({submissionId:newer.submissionId,status:'AWAITING_REVIEW'});
    let course=await outline.outlineForCourse(courseId,academyId,people.student!.id);
    // Class attribution is required for assessed progress.
    const scoped=await outline.statusByMaterial(people.student!.id,[materialId],classId);
    expect(scoped.get(materialId)?.scoreHundredths).toBeUndefined();
    await review.publish(identity('teacher'),grade(newer.submissionId));
    expect((await outline.statusByMaterial(people.student!.id,[materialId],classId)).get(materialId)).toMatchObject({status:'SOLVED',scoreHundredths:8000});
    await db.programmingExercise.update({where:{materialId},data:{manualIncludeInScore:false,gradingRevision:{increment:1}}});
    const excluded=await submit.submit(identity('student'),request('excluded')); await review.publish(identity('manager'),grade(excluded.submissionId));
    const bootstrap=await learn.getExerciseBootstrap(identity('student'),{academyId,materialId,classId,mode:'student'});
    expect(bootstrap.workspace.latestResult?.manualAssessment?.scoreHundredths).toBe(8000);
    expect(bootstrap.navigator.course.progress.total).toBe(0);
    await db.programmingExercise.update({where:{materialId},data:{manualIncludeInScore:true,gradingRevision:{increment:1}}});
    expect((await review.get(identity('teacher'),{academyId,classId,submissionId:newer.submissionId})).assessment.maximumHundredths).toBe(10000);
  });
  it('rejects hidden ancestors, cross-academy admission and manual sample grading',async()=>{
    const course=await db.course.findUniqueOrThrow({where:{id:courseId},select:{modules:{select:{id:true}}}});
    for (const [model,id] of [[db.material,materialId],[db.lecture,lectureId],[db.courseModule,course.modules[0]!.id],[db.course,courseId]] as const) {
      await (model.update as Function)({where:{id},data:{isVisible:false}});
      expect(await readSubmissionAdmission(db,materialId,academyId)).toBeNull();
      await expect(submit.submit(identity('student'),request())).rejects.toThrow();
      await (model.update as Function)({where:{id},data:{isVisible:true}});
    }
    expect(await readSubmissionAdmission(db,materialId,randomUUID())).toBeNull();
    const access=new AcademyAccessService(prisma,new SupportGrantResolver(prisma));
    const samples=new SampleCheckService(prisma,access,new ConfigService(),new LearningClassContextService(prisma),{...queue,redis:vi.fn()} as unknown as JudgeQueue);
    await expect(samples.start(identity('student'),{academyId,classId,materialId,position:1,workspaceRevision:1,code:'print(1)',clientRequestId:randomUUID()})).rejects.toThrow();
  });
  it('keeps manual assessment out of automatic completion and acceptance metrics',async()=>{
    const automatic = await teacher.listStudents(identity('manager'),{academyId,classId});
    expect(automatic.summary.eligiblePairs).toBe(0);
    expect(automatic.rows[0]).toMatchObject({attempts:0,acceptedPercent:0,solvedProblems:0});
    const mixed=await history.listStudentMaterials(identity('manager'),{academyId,classId,membershipId:people.student!.membership,page:1});
    expect(mixed.rows.find(row=>row.materialId===materialId)).toMatchObject({status:'previous_revision',score:null});
  });
  it('enforces receipt constraints and hides review tables from browser roles',async()=>{
    const accepted=await submit.submit(identity('student'),request());
    await expect(db.submission.update({where:{id:accepted.submissionId},data:{score:0}})).rejects.toThrow();
    await expect(db.submission.update({where:{id:accepted.submissionId},data:{code:'Changed after submit'}})).rejects.toThrow();
    await review.publish(identity('teacher'),grade(accepted.submissionId));
    await expect(db.programmingSubmissionReview.updateMany({where:{submissionId:accepted.submissionId},data:{scoreHundredths:1}})).rejects.toThrow();
    const result=await db.$queryRaw<Array<{relrowsecurity:boolean}>>`SELECT relrowsecurity FROM pg_class WHERE relname='programming_submission_reviews'`;
    expect(result[0]?.relrowsecurity).toBe(true);
  });
  it('keeps SQL statement counts fixed for 1 and 20 materials/students/attempts/review versions',async()=>{
    await db.programmingSubmissionReview.deleteMany({where:{submission:{courseId}}});
    await db.submission.deleteMany({where:{courseId}});
    const accepted=await submit.submit(identity('student'),request());
    async function reads() {
      const measured: Record<string,number>={};
      async function measure(name:string,read:()=>Promise<unknown>){sqlCount=0;await read();measured[name]=sqlCount;}
      await measure('student_result',()=>submit.get(identity('student'),{academyId,submissionId:accepted.submissionId}));
      await measure('staff_review',()=>review.get(identity('manager'),{academyId,classId,submissionId:accepted.submissionId}));
      await measure('student_history',()=>records.listAnswerRecords(identity('student'),{academyId}));
      await measure('teacher_attempts',()=>teacher.listAttempts(identity('teacher'),{academyId,classId,membershipId:people.student!.membership,materialId}));
      await measure('teacher_work_history',()=>history.listAttempts(identity('manager'),{academyId,classId,membershipId:people.student!.membership,materialId}));
      await measure('teacher_problem_students',()=>history.listMaterialStudents(identity('manager'),{academyId,classId,materialId}));
      await measure('teacher_student_materials',()=>history.listStudentMaterials(identity('manager'),{academyId,classId,courseId,page:1,membershipId:people.student!.membership}));
      await measure('latest',()=>learn.getLatestSubmission(identity('student'),{academyId,materialId,classId,mode:'student'}));
      await measure('learner_bootstrap',()=>learn.getExerciseBootstrap(identity('student'),{academyId,materialId,classId,mode:'student'}));
      return measured;
    }
    async function publication(name:string,input:ReturnType<typeof grade>) {
      sqlCount=0;statements=[];await review.publish(identity('manager'),input);
      counts[name]={total:sqlCount,reads:statements.filter(q=>/^SELECT/i.test(q)).length,
        writes:statements.filter(q=>/^(INSERT|UPDATE|DELETE)/i.test(q)).length,
        control:statements.filter(q=>!/^(SELECT|INSERT|UPDATE|DELETE)/i.test(q)).length};
    }
    const initial=grade(accepted.submissionId);
    await publication('publication',initial);
    await publication('idempotent_publication',initial);
    const small=await reads();
    for(let i=1;i<20;i++) await review.publish(identity('manager'),grade(accepted.submissionId,{expectedVersion:i,scoreHundredths:i,reason:'Review fixture'}));
    for(let i=1;i<20;i++) await submit.submit(identity('student'),request(`snapshot ${i}`));
    const extra=Array.from({length:19},(_,i)=>({id:randomUUID(),auth:randomUUID(),membership:randomUUID(),material:randomUUID(),index:i}));
    await db.user.createMany({data:extra.map(p=>({id:p.id,authUserId:p.auth,displayName:`Extra ${p.index}`,status:'ACTIVE' as const}))});
    await db.academyMembership.createMany({data:extra.map(p=>({id:p.membership,userId:p.id,academyId,role:'STUDENT' as const,status:'ACTIVE' as const}))});
    await db.classEnrollment.createMany({data:extra.map(p=>({classId,membershipId:p.membership,enrolledByUserId:people.manager!.id}))});
    await db.material.createMany({data:extra.map(p=>({id:p.material,lectureId,type:'PROGRAMMING_EXERCISE' as const,title:`Extra ${p.index}`,position:p.index+2,isVisible:true}))});
    await db.programmingExercise.createMany({data:extra.map(p=>({materialId:p.material,externalKey:`extra-${p.material}`,difficulty:'EASY' as const,submissionPolicy:'MANUAL_REVIEW' as const}))});
    const template=await db.submission.findUniqueOrThrow({where:{id:accepted.submissionId}});
    const {id:unused,requestId,reviewVersion,manualReviewResult,...receipt}=template;
    await db.submission.createMany({data:extra.flatMap(p=>[
      {...receipt,id:randomUUID(),userId:p.id,requestId:randomUUID(),manualAssessmentSnapshot:receipt.manualAssessmentSnapshot!,manualReviewResult:undefined,reviewVersion:0,gradingPolicySnapshot:undefined,executionRuntimeSnapshot:undefined,quizSnapshot:undefined,feedbackPolicy:undefined},
      {...receipt,id:randomUUID(),materialId:p.material,sourceMaterialId:p.material,requestId:randomUUID(),manualAssessmentSnapshot:receipt.manualAssessmentSnapshot!,manualReviewResult:undefined,reviewVersion:0,gradingPolicySnapshot:undefined,executionRuntimeSnapshot:undefined,quizSnapshot:undefined,feedbackPolicy:undefined},
    ])});
    const expanded=await reads(); expect(expanded).toEqual(small);
    expect(small).toEqual({student_result:4,staff_review:6,student_history:12,teacher_attempts:13,
      teacher_work_history:15,teacher_problem_students:23,teacher_student_materials:22,latest:6,learner_bootstrap:19});
    counts.reads={small,expanded};
    // The v2 material metadata shape, measured against the same expanded fixture.
    sqlCount=0;
    const legacy=await db.material.findMany({where:{lectureId},select:{id:true,title:true,type:true,position:true,isRequired:true,
      programmingExercise:{select:{gradingRevision:true,submissionPolicy:true,manualMaximumHundredths:true,manualIncludeInScore:true}},
      manualMaterial:{select:{revision:true,includeInScore:true,submitEnabled:true}},
      lecture:{select:{id:true,title:true,position:true,courseModule:{select:{id:true,title:true,position:true,course:{select:{id:true,title:true}}}}}}},
      orderBy:[{lecture:{courseModule:{courseId:'asc'}}},{lecture:{courseModule:{position:'asc'}}},{lecture:{position:'asc'}},{position:'asc'},{id:'asc'}]});
    const baseline=sqlCount;sqlCount=0;
    expect(await readClassHistoryMaterials(db,academyId,classId)).toEqual(legacy);
    counts.material_metadata={v2:baseline,feature:sqlCount,delta:sqlCount-baseline};
    await publication('correction',grade(accepted.submissionId,{expectedVersion:20,scoreHundredths:9000,reason:'Measured correction'}));
  },30000);
});
