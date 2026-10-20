/** Local development test accounts only. Session files stay outside the repository. */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
const root=fileURLToPath(new URL('../../..',import.meta.url));
const require=createRequire(root+'/packages/web/package.json');
const {createServerClient}=require('@supabase/ssr');
const apiRequire=createRequire(root+'/packages/api/package.json');
apiRequire('dotenv').config({path:root+'/packages/api/.env',quiet:true});
if(new URL(process.env.SUPABASE_URL).hostname!=='lnrmxjxsjxymgphgatwn.supabase.co')throw Error('Development only');
apiRequire('dotenv').config({path:root+'/packages/web/.env.local',quiet:true});
const dir=process.env.E2E_AUTH_STATE_DIR ?? '/tmp/cove-pdf-grading-auth';await mkdir(dir,{recursive:true,mode:0o700});
for(const identifier of ['teamlead@cove.test','student@cove.test','teacher@cove.test']){
  const cookies=[];
  const client=createServerClient(process.env.SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY??process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>[],setAll:values=>cookies.push(...values)}});
  const {data,error}=await client.auth.signInWithPassword({email:identifier,password:'CoveDev123!'});
  if(error)throw Error(identifier+': '+error.message);
  if(identifier==='student@cove.test'){
    const response=await fetch('http://localhost:4000/api/rpc/studentSession/begin',{method:'POST',headers:{Authorization:'Bearer '+data.session.access_token,'Content-Type':'application/json',...(process.env.BFF_SHARED_SECRET?{'X-Cove-Bff-Secret':process.env.BFF_SHARED_SECRET}:{})},body:JSON.stringify({json:{}})});
    if(!response.ok)throw Error('Student lease: '+response.status);
  }
  await writeFile(dir+'/'+identifier+'.json',JSON.stringify({cookies:cookies.map(c=>({name:c.name,value:c.value,domain:'localhost',path:'/',expires:data.session.expires_at,httpOnly:false,secure:false,sameSite:'Lax'})),origins:[]}),{mode:0o600});
}
console.log('Prepared development test sessions without changing authentication settings.');
