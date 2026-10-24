import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
if (new URL(process.env.SUPABASE_URL ?? '').hostname !== 'lnrmxjxsjxymgphgatwn.supabase.co') throw new Error('Development database only');
const database=new URL(process.env.DATABASE_URL??'');
if(!database.hostname.includes('lnrmxjxsjxymgphgatwn')&&!database.username.includes('lnrmxjxsjxymgphgatwn'))throw new Error('Development database connection required');
const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
const academyId='20000000-0000-4000-8000-000000000001',classId='e0000000-0000-4000-8000-000000000040';
try {
 // Reuse the ready, seeded test PDF in its own course; never replace existing materials or drafts.
 const pdf=await db.material.findFirstOrThrow({where:{id:'ee090000-0000-4000-8000-000000000029',type:'PDF_DOCUMENT',isVisible:true,
  lecture:{isVisible:true,courseModule:{isVisible:true,course:{academyId,isVisible:true,classAssignments:{some:{classId}}}}},pdfDocument:{asset:{state:'READY'}}}});
 const position=await db.material.aggregate({where:{lectureId:pdf.lectureId},_max:{position:true}});
 const materialId=randomUUID();
 await db.material.create({data:{id:materialId,lectureId:pdf.lectureId,title:'Unified submission PDF QA',type:'PROGRAMMING_EXERCISE',position:(position._max.position??0)+1,isVisible:true,
 programmingExercise:{create:{externalKey:'unified-pdf-'+materialId,difficulty:'EASY',starterCode:'print("hello")',referencePdfMaterialId:pdf.id,
 gradingMode:'ELICE_STDIO',gradingSemanticVersion:'elice-v1',continuationPolicy:'CONTINUE_WITHIN_BUDGET',totalTimeLimitMs:60000,comparatorTimeLimitMs:1000,materialMaximumHundredths:2550,materialScorePolicy:'PROPORTIONAL',
 testCases:{create:[{position:1,input:'',expectedOutput:'hello',visibility:'SAMPLE',weight:1},{position:2,input:'',expectedOutput:'bye',visibility:'HIDDEN',weight:2}]}}}}});
 await writeFile('/tmp/unified-submit-pdf-fixture.json',JSON.stringify({academyId,classId,materialId}),{mode:0o600});
 console.log('Created fresh graded-PDF submission fixture:',materialId);
} finally {await db.$disconnect();}
