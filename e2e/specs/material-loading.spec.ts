import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { routes } from '../../packages/web/src/lib/routes';
const provider='http://127.0.0.1:4320';
type Fixture={id:string;academy:{id:string;slug:string}};
async function fixture(request:APIRequestContext,role:string,parentFixtureId?:string):Promise<Fixture>{
  const result=await request.post(provider+'/fixtures',{data:{role,parentFixtureId}});
  expect(result.ok(),await result.text()).toBe(true); return result.json();
}
async function enter(page:Page,fixture:Fixture){
  await page.context().addCookies([{name:'i18next',value:'en',url:'http://127.0.0.1:3309'}]);
  const response=await page.request.get('/sso/start',{maxRedirects:0,timeout:180_000});
  const target=new URL(response.headers().location!); target.searchParams.set('fixture',fixture.id);
  await page.goto(provider+'/os/authorize?'+target.searchParams);
  await expect(page).toHaveURL(/\/(?:academy\/|admin(?:\/|$))/);
}
test('PDF programming, mixed materials and recovery on localhost',async({page,browser,request},testInfo)=>{
  const shots=resolve('docs/research/assets/2026-11-17-material-loading-localhost',testInfo.project.name);
  await mkdir(shots,{recursive:true});
  console.info('MATERIAL_BROWSER',testInfo.project.name,'signing in');
  const author=await fixture(request,'lab_head'),learner=await fixture(request,'student',author.id),tutor=await fixture(request,'tutor',author.id);
  await enter(page,author);
  const context=await browser.newContext({baseURL:'http://127.0.0.1:3309',viewport:{width:1440,height:1000}});
  await context.route('https://dlab-sso-provider.invalid/storage/v1/object/sign/**',route=>route.fulfill({path:resolve('e2e/fixtures/lecture-material.pdf'),contentType:'application/pdf',headers:{'Access-Control-Allow-Origin':'*','Cross-Origin-Resource-Policy':'cross-origin'}}));
  const student=await context.newPage(); await enter(student,learner);
  const teacherContext=await browser.newContext({baseURL:'http://127.0.0.1:3309'}),teacher=await teacherContext.newPage(); await enter(teacher,tutor);
  const seeded=await request.post(`${provider}/fixtures/${author.id}/classroom`,{data:{studentFixtureId:learner.id,teacherFixtureId:tutor.id,emptyWork:true,includePdf:true,includeTurtle:true,includeExplanation:true,includeSecondProgramming:true,materialLoading:true}});
  expect(seeded.ok(),await seeded.text()).toBe(true);
  const room=await seeded.json(),slug=author.academy.slug,classId=room.classes[0].id;
  const material=(id:string,type:string)=>routes.academyLearnMaterial(slug,id,type as 'PROGRAMMING_EXERCISE',{classId});
  await student.goto(material(room.materialId,'PROGRAMMING_EXERCISE'));
  await expect(student.getByRole('heading',{name:'Add two numbers',exact:true})).toBeVisible();
  await expect(student.getByText('Lesson reference PDF',{exact:true}).first()).toBeVisible();
  await expect(student.locator('.react-pdf__Page__canvas').first()).toBeVisible({timeout:60_000});
  await student.screenshot({path:resolve(shots,'01-linked-pdf-programming.png'),animations:'disabled'});
  for(const [id,type,title] of [
    [room.secondProgrammingMaterialId,'PROGRAMMING_EXERCISE','Add two numbers'],
    [room.writtenMaterialId,'WRITTEN_RESPONSE','Explain your addition'],
    [room.shortMaterialId,'WRITTEN_RESPONSE','Name the language'],
    [room.quizMaterialId,'MULTIPLE_CHOICE','Choose the operator'],
    [room.pdfMaterialId,'PDF_DOCUMENT','Lesson reference PDF'],
    [room.videoMaterialId,'VIDEO_LESSON','Lesson video'],
    [room.explanationMaterialId,'EXPLANATION','How addition works'],
    [room.turtleMaterialId,'TURTLE_EXERCISE','Draw a red square'],
  ]){
    console.info('MATERIAL_BROWSER',testInfo.project.name,type);
    await student.goto(material(id,type));
    await expect(student.getByRole('heading',{name:title,exact:true}).first()).toBeVisible();
    await expect(student.getByText('This academy is not available')).toHaveCount(0);
    await expect(student.getByRole('alert').filter({hasText:/could not be loaded|불러오지 못/})).toHaveCount(0);
    if(type==='WRITTEN_RESPONSE') await expect(student.getByRole('textbox').first()).toBeVisible();
    if(type==='PDF_DOCUMENT') await expect(student.locator('.react-pdf__Page__canvas').first()).toBeVisible({timeout:60_000});
    if(type==='VIDEO_LESSON') await expect(student.locator('video')).toBeVisible();
    if(type==='TURTLE_EXERCISE') await expect(student.locator('.monaco-editor').first()).toBeVisible();
    await student.screenshot({path:resolve(shots,`material-${type}-${id===room.shortMaterialId?'short':type==='PROGRAMMING_EXERCISE'?'plain':'lesson'}.png`),animations:'disabled'});
    if(type==='MULTIPLE_CHOICE') await student.screenshot({path:resolve(shots,'02-quiz.png'),animations:'disabled'});
  }
  await student.goto(material(room.pdfMaterialId,'PDF_DOCUMENT'));
  await student.locator('footer').getByText(/^(Next|다음)$/).click();
  await expect(student.getByRole('heading',{name:'Name the language',exact:true})).toBeVisible();
  await student.locator('footer').getByText(/^(Next|다음)$/).click();
  await expect(student.getByRole('heading',{name:'Choose the operator',exact:true})).toBeVisible();
  await student.getByRole('complementary').getByRole('button',{name:/Lesson reference PDF/}).click();
  await expect(student.getByRole('heading',{name:'Lesson reference PDF',exact:true})).toBeVisible();
  // Real staff read for the same exercise, without changing the user's role.
  for(const viewer of [page,teacher]){
    await viewer.context().route('https://dlab-sso-provider.invalid/storage/v1/object/sign/**',route=>route.fulfill({path:resolve('e2e/fixtures/lecture-material.pdf'),contentType:'application/pdf',headers:{'Access-Control-Allow-Origin':'*','Cross-Origin-Resource-Policy':'cross-origin'}}));
    await viewer.goto(routes.academyLearnMaterial(slug,room.materialId,'PROGRAMMING_EXERCISE'));
    await expect(viewer.getByRole('button',{name:/View solution|정답 보기/}).first()).toBeVisible();
    await expect(viewer.getByText('Lesson reference PDF',{exact:true}).first()).toBeVisible();
    await expect(viewer.locator('.react-pdf__Page__canvas').first()).toBeVisible();
    if(viewer===page) await page.close();
  }
  await student.goto(material(room.materialId,'PROGRAMMING_EXERCISE'));
  await teacher.goto(routes.academyTeachStudentLive(slug,classId,room.studentMembershipId)+'?materialId='+room.materialId);
  await expect(teacher.getByText('Lesson reference PDF',{exact:true}).first()).toBeVisible();
  await expect(teacher.locator('.react-pdf__Page__canvas').first()).toBeVisible({timeout:60_000});
  await teacher.screenshot({path:resolve(shots,'staff-monitoring.png'),animations:'disabled'});
  await teacherContext.close();
  console.info('MATERIAL_BROWSER',testInfo.project.name,'server recovery');
  // An upstream failure during the server render must reach the retry boundary.
  await request.post(provider+'/testing/failure',{data:{enabled:true,operation:'/getExerciseBootstrap',materialId:room.materialId}});
  await student.goto(material(room.materialId,'PROGRAMMING_EXERCISE'));
  await expect(student.getByRole('heading',{name:/could not be loaded|불러오지 못/})).toBeVisible();
  await student.screenshot({path:resolve(shots,'03-server-error-retry.png'),animations:'disabled'});
  await request.post(provider+'/testing/failure',{data:{enabled:false}});
  await student.getByRole('button',{name:/Try again|다시 시도/}).click();
  await expect(student.getByRole('heading',{name:'Add two numbers',exact:true})).toBeVisible();
  await expect(student.getByText('Lesson reference PDF',{exact:true}).first()).toBeVisible();
  // Unknown REST 404 is a transport fault. A named PDF denial is unavailable.
  for(const [status,body,recoverable] of [[502,{code:'INTERNAL_SERVER_ERROR'},true],[404,{},true],[404,{code:'PDF_NOT_AVAILABLE'},false]] as const){
    await context.route('**/api/documents?**',route=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)}));
    await request.post(provider+'/testing/failure',{data:{enabled:true,operation:'/documents',materialId:room.pdfMaterialId}});
    await student.goto(material(room.pdfMaterialId,'PDF_DOCUMENT'));
    await expect(student.getByRole('heading',{name:recoverable?/could not be loaded|불러오지 못/:/activity is not available|이용할 수 없/})).toBeVisible();
    await expect(student.getByRole('button',{name:/Try again|다시 시도/})).toHaveCount(recoverable?1:0);
    await context.unroute('**/api/documents?**');
    await request.post(provider+'/testing/failure',{data:{enabled:false}});
    if(recoverable){await student.getByRole('button',{name:/Try again|다시 시도/}).click();await expect(student.locator('.react-pdf__Page__canvas').first()).toBeVisible({timeout:60_000});}
    else await student.screenshot({path:resolve(shots,'04-activity-unavailable.png'),animations:'disabled'});
  }
  for(const [id,type,endpoint,title] of [
    [room.shortMaterialId,'WRITTEN_RESPONSE','manual','Name the language'],
    [room.quizMaterialId,'MULTIPLE_CHOICE','manual','Choose the operator'],
    [room.videoMaterialId,'VIDEO_LESSON','videos','Lesson video'],
    [room.explanationMaterialId,'EXPLANATION','explanations','How addition works'],
  ]){
    console.info('MATERIAL_BROWSER',testInfo.project.name,'recovery',type);
    await request.post(provider+'/testing/failure',{data:{enabled:true,operation:'/'+endpoint,materialId:id}});
    await context.route(`**/api/${endpoint}?**`,route=>route.fulfill({status:502,contentType:'text/html',body:'Local failed gateway'}));
    await student.goto(material(id,type));
    await expect(student.getByRole('heading',{name:/could not be loaded|불러오지 못/})).toBeVisible();
    await request.post(provider+'/testing/failure',{data:{enabled:false}});
    await context.unroute(`**/api/${endpoint}?**`);
    await student.getByRole('button',{name:/Try again|다시 시도/}).click();
    await expect(student.getByRole('heading',{name:title,exact:true}).first()).toBeVisible();
  }
  await student.goto(routes.academyLearnMaterial(slug,room.materialId,'PROGRAMMING_EXERCISE',{classId:'00000000-0000-4000-8000-000000000001'}));
  await expect(student.getByRole('heading',{name:/activity is not available|이용할 수 없/})).toBeVisible();
  await expect(student.getByText('This academy is not available')).toHaveCount(0);
  await context.addCookies([{name:'i18next',value:'ko',url:'http://127.0.0.1:3309'}]);
  await context.route('**/api/documents?**',route=>route.fulfill({status:502,contentType:'application/json',body:'{}'}));
  await student.goto(material(room.pdfMaterialId,'PDF_DOCUMENT'));
  await expect(student.getByRole('heading',{name:'학습 자료를 불러오지 못했습니다'})).toBeVisible();
  await student.evaluate(()=>document.documentElement.classList.add('dark'));
  await student.screenshot({path:resolve(shots,'05-korean-dark-recovery.png'),animations:'disabled'});
  await context.unroute('**/api/documents?**');
  await context.close();
});
