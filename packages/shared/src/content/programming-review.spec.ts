import {describe,expect,it} from 'vitest';
import {programmingReviewInputSchema} from './programming-review.js';
import {createProgrammingExerciseSchema,legacyGradingProfile} from './course.js';
import {submissionAcceptedSchema,submissionResultSchema} from './submission.js';
const id='10000000-0000-4000-8000-000000000001';
describe('manual programming contracts',()=>{
  it('permits no tests or solutions for manual coding but rejects a zero-case automatic receipt',()=>{
    expect(createProgrammingExerciseSchema.safeParse({academyId:id,courseId:id,lectureId:id,submissionPolicy:'MANUAL_REVIEW',
      title:'Manual exercise',difficulty:'EASY',description:'<p>Write a game.</p>',inputFormat:'',outputFormat:'',constraints:'',
      starterCode:'',solutions:[],aiFeedbackEnabled:false,isVisible:true,testCases:[],hints:[],grading:legacyGradingProfile}).success).toBe(true);
    expect(submissionAcceptedSchema.safeParse({submissionId:id,totalCount:0}).success).toBe(false);
  });
  it('rejects scores and test verdicts on a recorded manual receipt',()=>{
    const receipt={submissionId:id,materialId:id,status:'RECORDED',submissionPolicy:'MANUAL_REVIEW',manualAssessment:null,
      score:null,passedCount:0,totalCount:0,cases:[],runtimeMs:null,failureReason:null,elapsedSec:0,attemptCount:0,
      createdAt:'2026-11-12T00:00:00.000Z',gradedAt:null};
    expect(submissionResultSchema.safeParse(receipt).success).toBe(true);
    expect(submissionResultSchema.safeParse({...receipt,score:0}).success).toBe(false);
    expect(submissionResultSchema.safeParse({...receipt,totalCount:1}).success).toBe(false);
    expect(submissionResultSchema.safeParse({...receipt,submissionPolicy:'AUTOMATIC'}).success).toBe(false);
    expect(submissionResultSchema.safeParse({...receipt,status:'PASSED',submissionPolicy:'AUTOMATIC'}).success).toBe(false);
  });
  it('accepts zero, decimal hundredths and optional correction reasons while enforcing integer input',()=>{
    const input={academyId:id,classId:id,submissionId:id,requestId:id,expectedVersion:0,scoreHundredths:0,completed:false,feedback:'',reason:''};
    expect(programmingReviewInputSchema.safeParse(input).success).toBe(true);
    expect(programmingReviewInputSchema.safeParse({...input,expectedVersion:1}).success).toBe(true);
    expect(programmingReviewInputSchema.parse({...input,expectedVersion:1,reason:undefined}).reason).toBe('');
    expect(programmingReviewInputSchema.safeParse({...input,reason:'x'.repeat(1001)}).success).toBe(false);
    expect(programmingReviewInputSchema.safeParse({...input,expectedVersion:1,reason:'Correction',scoreHundredths:9012}).success).toBe(true);
    expect(programmingReviewInputSchema.safeParse({...input,scoreHundredths:1.5}).success).toBe(false);
    expect(programmingReviewInputSchema.safeParse({...input,scoreHundredths:-1}).success).toBe(false);
  });
});
