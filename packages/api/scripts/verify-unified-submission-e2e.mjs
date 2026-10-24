import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
// Uses only short-lived prepared development sessions; never production cookies.
const authDir=process.env.E2E_AUTH_STATE_DIR??'/tmp/unified-submit-auth';
const base=process.env.E2E_SUBMISSION_API??'http://localhost:4000';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw new Error('Local API only');
const fixture=JSON.parse(await readFile(process.env.E2E_SUBMISSION_FIXTURE ?? '/tmp/unified-submit-fixture.json', 'utf8'));
const {academyId,ids,classId}=fixture;
async function headers(name){const state=JSON.parse(await readFile(authDir+'/'+name+'@cove.test.json', 'utf8'));const cookie=state.cookies.filter(x=>x.name.startsWith('sb-')).sort((a,b)=>a.name.localeCompare(b.name)).map(x=>x.value).join('');const session=JSON.parse(Buffer.from(cookie.slice(7),'base64url'));return {Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'};}
async function call(name,path,input,method='POST'){const r=await fetch(base+'/api/'+path,{method,headers:await headers(name),...(method==='POST'?{body:JSON.stringify(path.startsWith('rpc/')?{json:input}:input)}:{})});const result=await r.json();assert.ok(r.ok,JSON.stringify({name,path,status:r.status,result}));return path.startsWith('rpc/')?result.json:result;}
for(const name of ['teacher','teamlead','manager']){
 const input={academyId,materialId:ids.coding,mode:'staff-practice'};
 for(const [code,score] of [['print("hello")',10000],['print("wrong")',0]]){
 const accepted=await call(name,'rpc/learn/submitPractice',{academyId,materialId:ids.coding,code,requestId:randomUUID()});
 let latest;const until=Date.now()+90000;
 do {latest=await call(name,'rpc/learn/getLatestSubmission',input);if(latest?.status==='GRADED')break;await new Promise(resolve=>setTimeout(resolve,1000));}while(Date.now()<until);
 assert.equal(latest?.submissionId,accepted.submissionId);assert.equal(latest?.scoreHundredths,score,JSON.stringify(latest));
 }
 console.log(name+': real Python pass then zero, persisted latest correct');
}
{
 const name='student', target={academyId,materialId:ids.coding,classId};
 const session=await call(name,'rpc/learn/startSolveSession',target);
 for(const [code,score] of [['print("hello")',10000],['print("wrong")',0]]) {
  const accepted=await call(name,'rpc/learn/submit',{...target,code,solveSessionId:session.solveSessionId});
  let latest;const until=Date.now()+90000;
  do {latest=await call(name,'rpc/learn/getLatestSubmission',{...target,mode:'student'});if(latest?.status==='GRADED')break;await new Promise(resolve=>setTimeout(resolve,1000));}while(Date.now()<until);
  assert.equal(latest?.submissionId,accepted.submissionId);assert.equal(latest?.scoreHundredths,score,JSON.stringify(latest));
 }
 console.log('student: real Python pass then zero, persisted class latest correct');
}
for(const name of ['student','teacher','teamlead','manager']){
 const staff=name!=='student';
 for(const key of ['turtle','written','exact','regex','manual','choice']){
 const target={academyId,materialId:ids[key]};
 const accepted=await call(name,'manual/'+(staff?'practice-submit':'submit'),{...target,...(staff?{preview:true}:{classId}),files:{'main.py':'import turtle as t\nt.forward(100)'},answer:'Python',revision:0,contentRevision:1,requestKey:randomUUID(),...(key==='choice'?{selectedOptionIds:[fixture.option],displayOrder:[fixture.option,fixture.other]}:{})});
 let data; const until=Date.now()+30000; do { data=await call(name,'manual?'+new URLSearchParams({...target,...(staff?{preview:'true'}:{classId})}),undefined,'GET'); if(data.latestSubmission?.status!=='PENDING')break; await new Promise(resolve=>setTimeout(resolve,500)); } while(Date.now()<until);
 assert.equal(data.latestSubmission?.submissionId,accepted.submissionId);assert.equal(data.latestSubmission?.status,['exact','regex','choice'].includes(key)?'GRADED':staff?'RECORDED':'AWAITING_REVIEW');
 }
 console.log(name+': all 6 manual activity types accepted with correct latest state');
}

{
 const target={academyId,materialId:ids.written};
 const read=()=>call('student','manual?'+new URLSearchParams({...target,classId}),undefined,'GET');
 const before=await read(), attempt=before.attempts.find(row=>row.id===before.latestSubmission.submissionId);
 await call('manager','manual/review',{...target,submissionId:attempt.id,expectedVersion:attempt.reviewVersion,scoreHundredths:1234,completed:true,feedback:'Local QA published review'});
 const after=await read();
 assert.equal(after.latestSubmission.status,'GRADED');assert.equal(after.latestSubmission.scoreHundredths,1234);assert.equal(after.latestSubmission.createdAt,before.latestSubmission.createdAt);
 console.log('student: published review updates score to 12.34 without changing submission time');
}
