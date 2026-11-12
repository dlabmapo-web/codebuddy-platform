import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
import {routes} from '../../packages/web/src/lib/routes';
const provider=`http://127.0.0.1:${process.env.COVE_DLAB_TEST_PROVIDER_PORT??4320}`;
const api=`http://127.0.0.1:${process.env.COVE_DLAB_TEST_API_PORT??4319}/api/rpc`;
const studio=`http://127.0.0.1:${process.env.COVE_DLAB_TEST_WEB_PORT??3309}`;
type Fixture={id:string;academy:{id:string;slug:string}};
async function fixture(request:APIRequestContext,role:string,parentFixtureId?:string):Promise<Fixture>{
  const response=await request.post(provider+'/fixtures',{data:{role,parentFixtureId}});
  expect(response.ok(),await response.text()).toBe(true);return response.json();
}
async function enter(page:Page,value:Fixture){
  const response=await page.request.get('/sso/start',{maxRedirects:0});
  const target=new URL(response.headers().location!);target.searchParams.set('fixture',value.id);
  await page.goto(provider+'/os/authorize?'+target.searchParams);
  await expect(page).toHaveURL(new RegExp('/academy/'+value.academy.slug+'(?:/|$)'));
}
async function token(page:Page){
  const parts=(await page.context().cookies()).filter(c=>/auth-token(?:\.\d+)?$/.test(c.name)).sort((a,b)=>a.name.localeCompare(b.name));
  return JSON.parse(Buffer.from(parts.map(c=>c.value).join('').replace(/^base64-/,''),'base64url').toString()).access_token as string;
}
async function rpc(page:Page,path:string,input:unknown){
  const response=await page.request.post(api+'/'+path,{headers:{Authorization:'Bearer '+await token(page)},data:{json:input}});
  expect(response.ok(),await response.text()).toBe(true);return (await response.json()).json;
}
test('student submits; assigned Teacher, Team Lead and Manager publish/correct with visible results',async({page,browser,request},info)=>{
  const manager=await fixture(request,'lab_head'),studentFixture=await fixture(request,'student',manager.id),
    leadFixture=await fixture(request,'edu_manager',manager.id),teacherFixture=await fixture(request,'tutor',manager.id);
  const studentContext=await browser.newContext({baseURL:studio}),leadContext=await browser.newContext({baseURL:studio}),teacherContext=await browser.newContext({baseURL:studio});
  const student=await studentContext.newPage(),lead=await leadContext.newPage(),teacher=await teacherContext.newPage();
  try{
    await enter(page,manager);await enter(student,studentFixture);await enter(lead,leadFixture);await enter(teacher,teacherFixture);
    const seeded=await request.post(`${provider}/fixtures/${manager.id}/classroom`,{data:{studentFixtureId:studentFixture.id,teacherFixtureId:teacherFixture.id,emptyWork:true}});
    expect(seeded.ok(),await seeded.text()).toBe(true);const room=await seeded.json();
    const academyId=manager.academy.id,classId=room.classes[0].id;
    const created=await rpc(page,'academyCourses/createExercise',{academyId,courseId:room.courseId,lectureId:room.lectureId,
      title:'Manual while-loop Mission',difficulty:'EASY',description:'<p>Write a while-loop game and ask your teacher to inspect it.</p>',
      inputFormat:'',outputFormat:'',constraints:'',starterCode:'print("teacher review")',solutions:[],aiFeedbackEnabled:false,isVisible:true,
      testCases:[],hints:[],submissionPolicy:'MANUAL_REVIEW',manualAssessment:{maximumHundredths:10000,includeInScore:false},
      grading:{mode:'LEGACY_STDIO',inputPromptPolicy:'INCLUDE',totalTimeLimitMs:null,comparatorTimeLimitMs:null,materialMaximumHundredths:null,materialScorePolicy:null}});
    const materialId=created.material.id;
    const authorRoute=routes.academyCourse(manager.academy.slug,room.courseId)+`/lectures/${room.lectureId}/exercises/${materialId}`;
    await page.goto(authorRoute);
    const manualMode=page.getByRole('radio',{name:/Teacher grading|수동 채점/});
    await expect(manualMode).toHaveAttribute('aria-checked','true');
    await manualMode.focus(); await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('radio',{name:/Automatic grading|자동 채점/})).toHaveAttribute('aria-checked','true');
    await page.keyboard.press('ArrowRight');
    await expect(manualMode).toHaveAttribute('aria-checked','true');
    await page.getByRole('spinbutton',{name:/Maximum points|만점/}).fill('120');
    await page.getByRole('checkbox',{name:/Include in course score|성적에 포함/}).check();
    await Promise.all([page.waitForResponse(r=>r.url().includes('/academyCourses/updateExercise') && r.ok()), page.getByRole('button',{name:/Save changes|변경.*저장/}).click()]);
    await expect(page).toHaveURL(routes.academyLearnCourse(manager.academy.slug,room.courseId));
    await page.goto(authorRoute);
    await expect(page.getByRole('spinbutton',{name:/Maximum points|만점/})).toHaveValue('120');
    await expect(page.getByRole('checkbox',{name:/Include in course score|성적에 포함/})).toBeChecked();
    await page.getByRole('spinbutton',{name:/Maximum points|만점/}).fill('100');
    await page.getByRole('checkbox',{name:/Include in course score|성적에 포함/}).uncheck();
    await Promise.all([page.waitForResponse(r=>r.url().includes('/academyCourses/updateExercise') && r.ok()), page.getByRole('button',{name:/Save changes|변경.*저장/}).click()]);
    await expect(page).toHaveURL(routes.academyLearnCourse(manager.academy.slug,room.courseId));
    await page.goto(authorRoute);
    await expect(page.getByRole('spinbutton',{name:/Maximum points|만점/})).toHaveValue('100');
    await expect(page.getByText('No test cases yet, so students cannot attempt this problem.',{exact:false})).toHaveCount(0);
    await page.getByRole('spinbutton',{name:/Maximum points|만점/}).scrollIntoViewIfNeeded();
    await page.screenshot({path:info.outputPath('author-manual-settings.png')});
    const streams:string[]=[];student.on('request',r=>{if(r.url().includes('/stream'))streams.push(r.url());});
    await student.goto(routes.academyLearnExercise(manager.academy.slug,materialId)+'?classId='+classId);
    await expect(student.getByRole('button',{name:/^Submit$|^제출$/})).toBeEnabled();
    await student.getByRole('button',{name:/^Submit$|^제출$/}).click();
    await expect(student.getByTestId('programming-assessment')).toContainText(/Awaiting teacher grading|수동 채점 대기/);
    await expect(student.getByTestId('programming-assessment')).not.toContainText('0 / 100');
    expect(streams).toEqual([]);
    const latest=await rpc(student,'learn/getLatestSubmission',{academyId,materialId,classId,mode:'student'});
    const reviewRoute=routes.academyTeachSubmission(manager.academy.slug,classId,room.studentMembershipId,latest.submissionId);
    await teacher.goto(reviewRoute);const panel=teacher.getByTestId('programming-grading-panel');
    await panel.getByRole('textbox',{name:/Final score|최종 점수/}).fill('80');
    await panel.getByRole('textbox',{name:/Feedback|피드백/}).fill('Good loop. Check the stopping condition.');
    await panel.getByRole('checkbox',{name:/Learning complete|학습 완료/}).check();
    await panel.getByRole('button',{name:/^Apply$|^적용$/}).click();
    await expect(panel).toContainText('80 / 100');
    await expect(student.getByTestId('programming-assessment')).toContainText('80 / 100');
    await expect(student.getByTestId('programming-assessment')).toContainText('Good loop.');
    for(const [staff,score] of [[lead,'85.25'],[page,'90']] as const){
      await staff.goto(reviewRoute);const grading=staff.getByTestId('programming-grading-panel');
      await expect(grading.getByRole('button',{name:/^Apply$|^적용$/})).toBeVisible();
      await grading.getByRole('textbox',{name:/Final score|최종 점수/}).fill(score);
      await expect(grading.getByText('→ '+score+' / 100',{exact:false})).toBeVisible();
      await grading.getByRole('textbox',{name:/Correction reason|수정 사유/}).fill('Reviewed the loop structure.');
      await grading.getByRole('button',{name:/^Apply$|^적용$/}).click();
      await expect(grading.getByTestId('programming-assessment')).toContainText(score+' / 100');
    }
    await student.reload();await expect(student.getByTestId('programming-assessment')).toContainText('90 / 100');
    await expect(student.getByTestId('programming-assessment')).toContainText(/Excluded from course score|성적 제외/);
    await page.getByRole('button',{name:/^Review history$|^채점 기록$/}).click();
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:info.outputPath('manager-grading-history.png'),fullPage:true});
    await student.setViewportSize({width:390,height:844});
    await student.keyboard.press('Escape');
    await student.getByRole('button',{name:/^Code$|^코드$/}).click();
    await expect(student.getByTestId('programming-assessment')).toBeVisible();
    await student.screenshot({path:info.outputPath('student-manual-result-mobile.png'),fullPage:true});
    expect(await student.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await expect(page.getByTestId('programming-grading-panel')).toContainText(/Version 3|3차/);
    await studentContext.addCookies([{name:'i18next',value:'ko',url:studio},{name:'cove-theme',value:'dark',url:studio}]);
    await student.reload(); await student.keyboard.press('Escape');
    await student.getByRole('button',{name:'코드',exact:true}).click();
    await expect(student.locator('html')).toHaveAttribute('data-theme','dark');
    await expect(student.getByTestId('programming-assessment')).toContainText('해당 문제는 채점이 불가하므로 담당 선생님에게 수동으로 채점을 받으세요.');
    await expect(student.getByTestId('programming-assessment')).toContainText('수동 채점 완료');
    await student.screenshot({path:info.outputPath('student-manual-result-ko-dark-mobile.png'),fullPage:true});
    await page.context().addCookies([{name:'i18next',value:'ko',url:studio},{name:'cove-theme',value:'dark',url:studio}]);
    await page.goto(reviewRoute);
    await expect(page.getByRole('textbox',{name:'최종 점수',exact:true})).toHaveValue('90');
    await page.getByRole('button',{name:'채점 기록',exact:true}).click();
    await expect(page.getByTestId('programming-grading-panel')).toContainText('3차');
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:info.outputPath('manager-grading-history-ko-dark.png'),fullPage:true});
  }finally{await studentContext.close();await leadContext.close();await teacherContext.close();}
});
