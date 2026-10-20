import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
if (new URL(process.env.SUPABASE_URL ?? '').hostname !== 'lnrmxjxsjxymgphgatwn.supabase.co') throw new Error('Development database only');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const academyId='20000000-0000-4000-8000-000000000001', courseId='ee090000-0000-4000-8000-000000000001', moduleId='ee090000-0000-4000-8000-000000000010', lectureId='ee090000-0000-4000-8000-000000000020', pdfId='ee090000-0000-4000-8000-000000000029', materialId='ee090000-0000-4000-8000-000000000030';
try {
  const author=await db.user.findUniqueOrThrow({where:{username:'cove-teamlead'}});
  const assetId='ee090000-0000-4000-8000-000000000028';
  await db.course.upsert({where:{id:courseId},create:{id:courseId,academyId,title:'E2E PDF Grading Policy',createdByUserId:author.id,isVisible:true},update:{isVisible:true}});
  await db.courseModule.upsert({where:{id:moduleId},create:{id:moduleId,courseId,externalKey:'pdf-grading',title:'PDF grading',position:1,isVisible:true},update:{}});
  await db.lecture.upsert({where:{id:lectureId},create:{id:lectureId,courseModuleId:moduleId,externalKey:'pdf-grading-lesson',title:'PDF grading lesson',position:1,isVisible:true},update:{}});
  const objectKey=`${academyId}/${courseId}/${lectureId}/${assetId}.pdf`;
  let asset=await db.pdfAsset.findUnique({where:{id:assetId}});
  if(!asset){
    const bytes=await readFile(new URL('../../../e2e/fixtures/lecture-material.pdf',import.meta.url));
    const storage=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false}});
    const {error}=await storage.storage.from('course-documents').upload(objectKey,bytes,{upsert:true,contentType:'application/pdf'});
    if(error)throw Error('Could not upload dedicated E2E PDF: '+error.message);
    asset=await db.pdfAsset.create({data:{id:assetId,objectKey,originalFilename:'pdf-grading-e2e.pdf',byteSize:bytes.length,checksumSha256:createHash('sha256').update(bytes).digest('hex'),pageCount:2,uploaderUserId:author.id,academyId,courseId,lectureId,state:'READY',consumedAt:new Date()}});
  }
  await db.material.upsert({where:{id:pdfId},create:{id:pdfId,lectureId,title:'Grading reference PDF',type:'PDF_DOCUMENT',position:1,isVisible:true,pdfDocument:{create:{assetId:asset.id,placement:'BOTH'}}},update:{isVisible:true,pdfDocument:{update:{assetId:asset.id}}}});
  await db.material.upsert({where:{id:materialId},create:{id:materialId,lectureId,title:'PDF grading exercise',type:'PROGRAMMING_EXERCISE',position:2,isVisible:true,programmingExercise:{create:{externalKey:'pdf-grading-exercise',difficulty:'EASY',description:'',inputFormat:'',outputFormat:'',constraints:'',starterCode:'',language:'PYTHON',timeLimitMs:3000,memoryLimitMb:256}}},update:{isVisible:true}});
  await db.programmingExercise.update({where:{materialId},data:{referencePdfMaterialId:pdfId,submissionPolicy:'PRACTICE_ONLY',gradingMode:'ELICE_STDIO',gradingSemanticVersion:'elice-v1',totalTimeLimitMs:15000,comparatorTimeLimitMs:500,materialMaximumHundredths:10000,materialScorePolicy:'ABSOLUTE_CAP',continuationPolicy:'CONTINUE_WITHIN_BUDGET',exitStatusPolicy:'FAIL_ON_RUNTIME_ERROR'}});
  await db.exerciseTestCase.upsert({where:{exerciseMaterialId_position:{exerciseMaterialId:materialId,position:1}},create:{exerciseMaterialId:materialId,position:1,input:'',expectedOutput:'hello',visibility:'HIDDEN',comparator:'STDOUT_MATCH',weight:100},update:{input:'',expectedOutput:'hello',visibility:'HIDDEN',comparator:'STDOUT_MATCH',weight:100}});
  await db.classCourse.upsert({where:{classId_courseId:{classId:'e0000000-0000-4000-8000-000000000040',courseId}},create:{classId:'e0000000-0000-4000-8000-000000000040',courseId,assignedByUserId:author.id},update:{}});
  console.log('Dedicated PDF grading fixture ready; existing courses and PDFs preserved.');
} finally {await db.$disconnect();}
