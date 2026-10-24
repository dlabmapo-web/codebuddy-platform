import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {signInAs} from '../support/auth';
const fixture=process.env.E2E_SUBMISSION_FIXTURE?JSON.parse(readFileSync(process.env.E2E_SUBMISSION_FIXTURE,'utf8')) as {academyId:string;classId:string;ids:Record<string,string>}:undefined;
test.skip(!fixture,'Requires isolated development fixture and prepared local sessions');
const path=(key:string,staff:boolean,preview=false)=>`/academy/development-academy/learn/${key==='coding'||key==='runOnly'?'exercises':key==='turtle'?'turtle':'quizzes'}/${fixture!.ids[key]}?${staff?(preview?'preview=true':''):'classId='+fixture!.classId}`;
async function login(page:Page,name:string,url:string){await signInAs({page,identifier:name+'@cove.test',password:'CoveDev123!',initialPath:url});}
async function code(page:Page,text:string){
 const editor=page.locator('.monaco-editor').first();
 await expect(editor).toBeVisible({timeout:60000});
 // Select through Monaco's public editor API, then use real input events.
 // Whole-model setValue() is intentionally not a student edit in a Yjs buffer.
 await expect.poll(()=>page.evaluate(()=>{
  const api=(window as unknown as {monaco?:{editor:{getEditors():Array<{getDomNode():HTMLElement|null;getModel():{getFullModelRange():unknown}|null;focus():void;setSelection(range:unknown):void}>}}}).monaco;
  const active=api?.editor.getEditors().find(editor=>Boolean(editor.getDomNode()?.getBoundingClientRect().width));
  const model=active?.getModel();if(!active||!model)return false;
  active.focus();active.setSelection(model.getFullModelRange());return true;
 })).toBe(true);
 await page.keyboard.insertText(text);
 await expect.poll(()=>page.evaluate(()=>{
  const model=(window as unknown as {monaco?:{editor:{getModels():Array<{getValue():string;isDisposed():boolean}>}}}).monaco?.editor.getModels().find(model=>!model.isDisposed());
  return model?.getValue();
 })).toBe(text);
}
for(const role of ['student','teacher','teamlead','manager']){
 test(`${role}: explicit answer grading, latest zero, reload, private preview and ungraded activities`,async({page},info)=>{
 const staff=role!=='student',errors:string[]=[],editorAssets:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 // Editor and worker must keep working when the external CDN is unavailable.
 await page.route('https://cdn.jsdelivr.net/**',route=>route.abort());
 page.on('response',response=>{if(new URL(response.url()).pathname.startsWith('/monaco/')){editorAssets.push(response.url());if(!response.ok())errors.push('Monaco asset: '+response.status()+' '+response.url());}});
 await login(page,role,path('exact',staff,true));
 const summary=page.getByTestId('latest-submission-summary');
 const submit=page.getByRole('button',{name:'Submit',exact:true});
 await expect(summary).toBeVisible();
 await page.getByLabel('Your answer',{exact:true}).fill('Python');await expect(submit).toBeEnabled();await submit.click();
 await expect(summary).toContainText('25.5 / 25.5');const firstTime=await summary.locator('time').getAttribute('datetime');expect(firstTime).toBeTruthy();
 await page.getByLabel('Your answer',{exact:true}).fill('wrong');await submit.click();await expect(summary).toContainText('0 / 25.5');
 await page.reload();await expect(summary).toContainText('0 / 25.5');
 await page.screenshot({path:info.outputPath(role+'-latest-zero.png')});
 if(staff){await page.goto(path('exact',true,false));await expect(summary).toBeVisible();await expect(summary.locator('time')).toHaveCount(0);}
 for(const key of ['regex','manual','choice','written','turtle']){
  await page.goto(path(key,staff,true));await expect(submit).toBeVisible();
  if(['regex','manual','written'].includes(key))await page.getByLabel('Your answer',{exact:true}).fill('Python');
  if(key==='choice')await page.getByRole('radio',{name:/Python/}).click();
  if(key==='turtle')await code(page,'import turtle as t\nt.forward(120)');
  await expect(submit).toBeEnabled();await submit.click();
  await expect(summary.locator('time')).toBeVisible();
  await expect(summary).toContainText(['regex','choice'].includes(key)?'25.5 / 25.5':staff?'Not automatically graded':'Awaiting review');
 }
 await page.screenshot({path:info.outputPath(role+'-turtle-recorded.png')});
 await page.context().addCookies([{name:'i18next',value:'ko',domain:'localhost',path:'/'}]);await page.reload();
 await expect(summary).toContainText('최근 제출');await expect(summary.locator('time')).toBeVisible();
 await page.setViewportSize({width:390,height:844});await expect(page.getByRole('button',{name:'제출',exact:true})).toBeVisible();
 expect(editorAssets.some(url=>/assets\/editor\.worker-/.test(url))).toBe(true);
 expect(errors).toEqual([]);
 });
 test(`${role}: real Python grading and latest attempt survives reload`,async({page},info)=>{
 const staff=role!=='student';await login(page,role,path('coding',staff));
 const summary=page.getByTestId('latest-submission-summary');const submit=page.getByRole('button',{name:'Submit',exact:true});
 await expect(submit).toBeEnabled({timeout:60000});await code(page,'print("hello")');const firstRequest=page.waitForRequest(r=>r.method()==='POST'&&r.url().endsWith('/learn/'+(staff?'submitPractice':'submit')));await submit.click();expect((await firstRequest).postDataJSON().json.code).toBe('print("hello")');
 await expect(summary).toContainText('100 / 100',{timeout:90000});
 await code(page,'print("wrong")');await expect(submit).toBeEnabled();const secondRequest=page.waitForRequest(r=>r.method()==='POST'&&r.url().endsWith('/learn/'+(staff?'submitPractice':'submit')));await submit.click();expect((await secondRequest).postDataJSON().json.code).toBe('print("wrong")');
 await expect(summary).toContainText('0 / 100',{timeout:90000});await page.reload();await expect(summary).toContainText('0 / 100');
 await page.screenshot({path:info.outputPath(role+'-coding-zero.png')});
 await page.goto(path('runOnly',staff));await expect(page.getByRole('button',{name:'Run',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Submit',exact:true})).toHaveCount(0);await expect(summary).toHaveCount(0);
 });
}
