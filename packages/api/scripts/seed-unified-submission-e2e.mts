import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
if (new URL(process.env.SUPABASE_URL ?? '').hostname !== 'lnrmxjxsjxymgphgatwn.supabase.co') throw new Error('Development database only');
const database=new URL(process.env.DATABASE_URL??'');
if(!database.hostname.includes('lnrmxjxsjxymgphgatwn')&&!database.username.includes('lnrmxjxsjxymgphgatwn'))throw new Error('Development database connection required');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const academyId = '20000000-0000-4000-8000-000000000001', classId = 'e0000000-0000-4000-8000-000000000040';
const courseId = randomUUID(), lectureId = randomUUID();
const ids = Object.fromEntries(['coding','runOnly','turtle','written','exact','regex','manual','choice','quiz','weighted'].map(key => [key,randomUUID()]));
try {
 const author = await db.user.findUniqueOrThrow({where:{username:'cove-teamlead'}});
 await db.course.create({data:{id:courseId,academyId,title:'Unified Submission QA '+courseId.slice(0,8),createdByUserId:author.id,isVisible:true,
 modules:{create:{title:'Submission checks',externalKey:'unified',position:1,isVisible:true,lectures:{create:{id:lectureId,title:'All activity types',externalKey:'unified',position:1,isVisible:true}}}}}});
 for (const [index,key] of ['coding','runOnly'].entries()) await db.material.create({data:{id:ids[key],lectureId,title:key,type:'PROGRAMMING_EXERCISE',position:index+1,isVisible:true,programmingExercise:{create:{externalKey:key,difficulty:'EASY',submissionPolicy:key==='runOnly'?'PRACTICE_ONLY':'AUTOMATIC',starterCode:'print("hello")',testCases:key==='coding'?{create:[{position:1,input:'',expectedOutput:'hello',visibility:'SAMPLE'}]}:undefined}}}});
 const option=randomUUID(), other=randomUUID();
 for (const [index,key] of ['turtle','written','exact','regex','manual','choice'].entries()) {
 const short = ['exact','regex','manual'].includes(key) ? {version:1,question:'Name the language',gradingMode:key.toUpperCase(),expectedAnswer:'Python',pattern:'^Python$'} : null;
 const choice = key==='choice'?{version:1,question:'Choose Python',selectionMode:'SINGLE',options:[{id:option,content:'Python'},{id:other,content:'Other'}],correctOptionIds:[option]}:null;
 await db.material.create({data:{id:ids[key],lectureId,title:key,type:key==='turtle'?'TURTLE_EXERCISE':key==='choice'?'MULTIPLE_CHOICE':'WRITTEN_RESPONSE',position:index+3,isVisible:true,manualMaterial:{create:{...(short?{shortAnswer:short}:{}),...(choice?{multipleChoice:choice}:{}),maximumHundredths:2550,includeInScore:false,files:key==='turtle'?{'main.py':'import turtle as t\nt.forward(100)'}:{},description:'<p>Local submission behavior check.</p>'}}}});
 }
 for (const [index,key] of ['quiz','weighted'].entries()) await db.material.create({data:{id:ids[key],lectureId,title:key,type:'PROGRAMMING_EXERCISE',position:9+index,isVisible:true,programmingExercise:{create:{externalKey:key,difficulty:'EASY',starterCode:key==='quiz'?'':'print("hello")',
  ...(key==='quiz'?{quiz:{choices:[{id:'correct',text:'Python'},{id:'wrong',text:'Other'}],correctChoiceId:'correct',explanation:'Python is correct.'}}:{gradingMode:'ELICE_STDIO',gradingSemanticVersion:'elice-v1',continuationPolicy:'CONTINUE_WITHIN_BUDGET',totalTimeLimitMs:60000,comparatorTimeLimitMs:1000,materialMaximumHundredths:2550,materialScorePolicy:'PROPORTIONAL',testCases:{create:[{position:1,input:'',expectedOutput:'hello',visibility:'SAMPLE',weight:1},{position:2,input:'',expectedOutput:'bye',visibility:'HIDDEN',weight:2}]}})
 }}}});
 await db.classCourse.create({data:{classId,courseId,assignedByUserId:author.id}});
 await writeFile('/tmp/unified-submit-fixture.json',JSON.stringify({academyId,classId,courseId,lectureId,ids,option,other}),{mode:0o600});
 console.log('Created isolated development submission fixture',courseId);
} finally { await db.$disconnect(); }
