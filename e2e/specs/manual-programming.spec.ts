import {test,expect,type Page,type APIRequestContext} from '@playwright/test';
import {routes} from '../../packages/web/src/lib/routes';
const provider=`http://127.0.0.1:${process.env.COVE_DLAB_TEST_PROVIDER_PORT??4320}`;
const api=`http://127.0.0.1:${process.env.COVE_DLAB_TEST_API_PORT??4319}/api/rpc`;
const studio=`http://127.0.0.1:${process.env.COVE_DLAB_TEST_WEB_PORT??3309}`;
type Fixture={id:string;academy:{id:string;slug:string}};
async function fixture(request:APIRequestContext,role:string,parentFixtureId?:string,name?:string):Promise<Fixture>{
  const response=await request.post(provider+'/fixtures',{data:{role,parentFixtureId,name}});
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
    leadFixture=await fixture(request,'edu_manager',manager.id),teacherFixture=await fixture(request,'tutor',manager.id),
    offlineFixture=await fixture(request,'student',manager.id,'Offline review student');
  const studentContext=await browser.newContext({baseURL:studio}),leadContext=await browser.newContext({baseURL:studio}),teacherContext=await browser.newContext({baseURL:studio});
  const student=await studentContext.newPage(),lead=await leadContext.newPage(),teacher=await teacherContext.newPage();
  const offlineContext=await browser.newContext({baseURL:studio}),offline=await offlineContext.newPage();
  let reloadingStudent=false;
  const navigationAborts:string[]=[],browserErrors:string[]=[];
  for(const observed of [page,student,lead,teacher])observed.on('pageerror',error=>{
    // WebKit can report an outgoing outline fetch as an exception during reload.
    // Restrict this exception to that controlled window and exact resource.
    if(info.project.name==='webkit' && observed===student && reloadingStudent && error.name==='Fetch API cannot load http' && /\/api\/rpc\/learn\/getCourseOutline due to access control checks\.$/.test(error.message)) navigationAborts.push(error.message);
    else browserErrors.push(error.message);
  });
  const reloadStudent=async()=>{
    reloadingStudent=true;
    try {await student.reload();} finally {reloadingStudent=false;}
  };
  try{
    await enter(page,manager);await enter(student,studentFixture);await enter(lead,leadFixture);await enter(teacher,teacherFixture);await enter(offline,offlineFixture);
    await expect(page.locator('html')).toHaveAttribute('data-cove-scroll-boundary','');
    const beforeSwipe=page.url();await page.mouse.move(700,300);await page.mouse.wheel(-700,0);
    await expect(page).toHaveURL(beforeSwipe);
    expect(await page.evaluate(()=>document.documentElement.scrollLeft)).toBe(0);
    await page.evaluate(()=>{
      const scroller=document.createElement('div');scroller.dataset.testid='scroll-boundary-fixture';
      scroller.style.cssText='position:fixed;left:400px;top:200px;width:200px;height:120px;overflow:auto;z-index:200;background:white';
      const content=document.createElement('div');content.style.cssText='width:1000px;height:800px';scroller.append(content);document.body.append(scroller);
    });
    const localScroll=page.getByTestId('scroll-boundary-fixture');await localScroll.hover();await page.mouse.wheel(250,0);
    await expect.poll(()=>localScroll.evaluate(node=>node.scrollLeft)).toBeGreaterThan(0);
    await page.mouse.wheel(-2000,0);await expect.poll(()=>localScroll.evaluate(node=>node.scrollLeft)).toBe(0);
    await page.mouse.wheel(-300,0);expect(await page.evaluate(()=>document.documentElement.scrollLeft)).toBe(0);
    await page.mouse.wheel(0,180);await expect.poll(()=>localScroll.evaluate(node=>node.scrollTop)).toBeGreaterThan(0);
    expect(await page.evaluate(()=>{const event=new WheelEvent('wheel',{deltaX:150,ctrlKey:true,bubbles:true,cancelable:true});document.body.dispatchEvent(event);return event.defaultPrevented;})).toBe(false);
    await localScroll.evaluate(node=>node.remove());
    const seeded=await request.post(`${provider}/fixtures/${manager.id}/classroom`,{data:{studentFixtureId:studentFixture.id,teacherFixtureId:teacherFixture.id,reviewStudentFixtureId:offlineFixture.id,emptyWork:true}});
    expect(seeded.ok(),await seeded.text()).toBe(true);const room=await seeded.json();
    const academyId=manager.academy.id,classId=room.classes[0].id;
    const created=await rpc(page,'academyCourses/createExercise',{academyId,courseId:room.courseId,lectureId:room.lectureId,
      title:'Manual while-loop Mission',difficulty:'EASY',description:'<p>Write a while-loop game and ask your teacher to inspect it.</p>',
      inputFormat:'',outputFormat:'',constraints:'',starterCode:'print("teacher review")',solutions:[],aiFeedbackEnabled:false,isVisible:true,
      testCases:[],hints:[],submissionPolicy:'MANUAL_REVIEW',manualAssessment:{maximumHundredths:10000,includeInScore:false},
      grading:{mode:'LEGACY_STDIO',inputPromptPolicy:'INCLUDE',totalTimeLimitMs:null,comparatorTimeLimitMs:null,materialMaximumHundredths:null,materialScorePolicy:null}});
    const materialId=created.material.id;
    await rpc(offline,'learn/submit',{academyId,classId,materialId,code:'print("OFFLINE MANUAL SNAPSHOT")',requestId:crypto.randomUUID(),manualAssessmentVersion:1});
    await offlineContext.close();
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
    await expect(page).toHaveURL(routes.academyLearnCourse(manager.academy.slug,room.courseId),{timeout:60000});
    await page.goto(authorRoute);
    await expect(page.getByRole('spinbutton',{name:/Maximum points|만점/})).toHaveValue('120');
    await expect(page.getByRole('checkbox',{name:/Include in course score|성적에 포함/})).toBeChecked();
    await page.getByRole('spinbutton',{name:/Maximum points|만점/}).fill('100');
    await page.getByRole('checkbox',{name:/Include in course score|성적에 포함/}).uncheck();
    await Promise.all([page.waitForResponse(r=>r.url().includes('/academyCourses/updateExercise') && r.ok()), page.getByRole('button',{name:/Save changes|변경.*저장/}).click()]);
    await expect(page).toHaveURL(routes.academyLearnCourse(manager.academy.slug,room.courseId),{timeout:60000});
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
    const reviewRoute=routes.academyTeachStudentWork(manager.academy.slug,classId,room.studentMembershipId,materialId)+'?attempt='+latest.submissionId;
    await teacher.goto(reviewRoute);
    await expect(teacher.getByTestId('programming-grading-drawer')).toHaveCount(0);
    await expect(teacher.getByRole('tab',{name:'Teacher grading',exact:true})).toHaveCount(0);
    for (const viewport of [{width:1440,height:1000},{width:1280,height:800}]) {
      await teacher.setViewportSize(viewport);
      await expect(teacher.locator('.monaco-editor').first()).toBeVisible();
      await expect(teacher.getByTestId('review-problem-description')).toBeVisible();
      expect(await teacher.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1)).toBe(true);
      await teacher.screenshot({path:info.outputPath(`teacher-history-${viewport.width}.png`)});
    }
    const statement=teacher.frameLocator('iframe').first();
    await expect(statement.locator('html')).toHaveAttribute('data-cove-scroll-boundary','');
    await statement.locator('#cove-rich-text-root').evaluate(body=>{
      const pre=document.createElement('pre');pre.dataset.testid='frame-scroll-fixture';pre.style.cssText='display:block;width:160px;height:60px;overflow-x:auto;white-space:pre';
      pre.textContent='long code '.repeat(100);body.prepend(pre);
    });
    const frameScroll=statement.getByTestId('frame-scroll-fixture');await frameScroll.hover();await teacher.mouse.wheel(250,0);
    await expect.poll(()=>frameScroll.evaluate(node=>node.scrollLeft)).toBeGreaterThan(0);
    await frameScroll.evaluate(node=>node.remove());
    await teacher.getByRole('button',{name:'Grade submission',exact:true}).click();
    const drawer=teacher.getByTestId('programming-grading-drawer'),panel=drawer.getByTestId('programming-grading-panel');
    await expect(drawer).toBeVisible();
    expect(await panel.evaluate(node=>Boolean(node.closest('[data-testid="review-output-pane"]')))).toBe(false);
    await expect.poll(async()=>{const box=(await drawer.boundingBox())!;return Math.round(box.x+box.width);}).toBe(1280);
    await panel.getByRole('textbox',{name:/Final score|최종 점수/}).fill('101');
    await expect(panel.getByRole('textbox',{name:/Final score|최종 점수/})).toHaveAttribute('aria-invalid','true');
    await expect(panel.getByRole('button',{name:'Publish grade',exact:true})).toBeDisabled();
    await panel.getByRole('textbox',{name:/Final score|최종 점수/}).fill('80');
    await panel.getByRole('textbox',{name:/Feedback|피드백/}).fill('Good loop. Check the stopping condition.');
    const confirmation=teacher.waitForEvent('dialog');
    const close=drawer.getByRole('button',{name:'Close grading',exact:true}).click();
    const dialog=await confirmation;expect(dialog.message()).toContain('grading changes');await dialog.dismiss();await close;
    await expect(drawer).toBeVisible();
    await expect(panel.getByRole('textbox',{name:/Final score|최종 점수/})).toHaveValue('80');
    await teacher.screenshot({path:info.outputPath('teacher-history-grading-sidebar.png')});
    await teacher.setViewportSize({width:390,height:844});
    await expect(panel.getByRole('button',{name:'Publish grade',exact:true})).toBeInViewport();
    for (const field of await panel.locator('input[inputmode="decimal"], textarea').all()) {
      const bounds=(await field.boundingBox())!;expect(bounds.x+bounds.width).toBeLessThanOrEqual(390);
    }
    await teacher.screenshot({path:info.outputPath('teacher-grading-sidebar-mobile.png')});
    expect(await teacher.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await panel.getByRole('radio',{name:/Learning complete|학습 완료/}).check();
    await panel.getByRole('button',{name:/^Publish grade$|^Update grade$|^채점 결과 등록$|^채점 결과 수정$/}).click();
    await expect(panel).toContainText('80 / 100');
    await expect(student.getByTestId('programming-assessment')).toContainText('80 / 100');
    await expect(student.getByTestId('programming-assessment')).toContainText('Good loop.');
    for(const [staff,score] of [[lead,'85.25'],[page,'90']] as const){
      await staff.goto(reviewRoute);await staff.getByRole('button',{name:'Edit grade',exact:true}).click();const grading=staff.getByTestId('programming-grading-panel');
      await expect(grading.getByRole('button',{name:/^Publish grade$|^Update grade$|^채점 결과 등록$|^채점 결과 수정$/})).toBeVisible();
      await grading.getByRole('textbox',{name:/Final score|최종 점수/}).fill(score);
      await expect(grading.getByText('→ '+score+' / 100',{exact:false})).toBeVisible();
      await grading.getByRole('textbox',{name:/Correction reason|수정 사유/}).fill('Reviewed the loop structure.');
      await grading.getByRole('button',{name:/^Publish grade$|^Update grade$|^채점 결과 등록$|^채점 결과 수정$/}).click();
      await expect(grading.getByTestId('programming-assessment')).toContainText(score+' / 100');
    }
    await reloadStudent();
    await expect(student.getByTestId('programming-assessment')).toContainText('90 / 100');
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
    await reloadStudent(); await student.keyboard.press('Escape');
    await student.getByRole('button',{name:'코드',exact:true}).click();
    await expect(student.locator('html')).toHaveAttribute('data-theme','dark');
    await expect(student.getByTestId('programming-assessment')).toContainText('해당 문제는 채점이 불가하므로 담당 선생님에게 수동으로 채점을 받으세요.');
    await expect(student.getByTestId('programming-assessment')).toContainText('수동 채점 완료');
    await student.screenshot({path:info.outputPath('student-manual-result-ko-dark-mobile.png'),fullPage:true});
    await page.context().addCookies([{name:'i18next',value:'ko',url:studio},{name:'cove-theme',value:'dark',url:studio}]);
    await page.goto(reviewRoute);
    await page.getByRole('button',{name:'채점 수정',exact:true}).click();
    await expect(page.getByRole('textbox',{name:'최종 점수',exact:true})).toHaveValue('90');
    await page.getByRole('button',{name:'채점 기록',exact:true}).click();
    await expect(page.getByTestId('programming-grading-panel')).toContainText('3차');
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:info.outputPath('manager-grading-history-ko-dark.png'),fullPage:true});
    // The same saved receipt is gradeable without leaving the live monitor.
    await student.setViewportSize({width:1440,height:1000});
    await page.context().addCookies([{name:'i18next',value:'en',url:studio},{name:'cove-theme',value:'light',url:studio}]);
    const liveRoute=routes.academyTeachStudentLive(manager.academy.slug,classId,room.studentMembershipId);
    await page.goto(liveRoute);
    await expect(page.getByTestId('observation-connection')).toContainText('Live');
    await page.getByRole('button',{name:'Edit grade',exact:true}).click();
    const liveDrawer=page.getByTestId('programming-grading-drawer');
    await expect(liveDrawer.getByRole('textbox',{name:'Final score',exact:true})).toHaveValue('90');
    // A new receipt arrives over the existing live channel; the open grade remains pinned.
    await expect.poll(()=>student.evaluate(()=>{
      const editor=(window as any).monaco?.editor.getEditors().find((item:any)=>item.getDomNode()?.getBoundingClientRect().width);
      if(!editor?.getModel())return false;editor.focus();editor.setSelection(editor.getModel().getFullModelRange());return true;
    })).toBe(true);
    await student.keyboard.insertText('print("SECOND SAVED SUBMISSION")');
    await student.getByRole('button',{name:/^Submit$|^제출$/}).click();
    await expect(liveDrawer).toContainText('A newer submission is available.');
    await liveDrawer.getByText('View submitted code',{exact:true}).click();
    await expect(liveDrawer.getByTestId('grading-submitted-code')).toHaveText('print("teacher review")');
    await liveDrawer.getByRole('button',{name:'Review newer submission',exact:true}).click();
    await expect(liveDrawer.getByRole('textbox',{name:'Final score',exact:true})).toHaveValue('');
    await liveDrawer.getByText('View submitted code',{exact:true}).click();
    await expect(liveDrawer.getByTestId('grading-submitted-code')).toHaveText('print("SECOND SAVED SUBMISSION")');
    await liveDrawer.getByRole('textbox',{name:'Final score',exact:true}).fill('95');
    await liveDrawer.getByRole('textbox',{name:'Feedback (optional)',exact:true}).fill('Graded during live monitoring.');
    await liveDrawer.getByRole('button',{name:'Publish grade',exact:true}).click();
    await expect(liveDrawer.getByTestId('programming-assessment')).toContainText('95 / 100');
    await expect(student.getByTestId('programming-assessment')).toContainText('95 / 100');
    async function assertHistoryOutcome(complete:boolean) {
      const history=await page.context().newPage();
      try {
        await history.goto(routes.academyTeachProgress(manager.academy.slug,classId)+'?view=students&student='+room.studentMembershipId+'&course='+room.courseId);
        const row=history.getByRole('row').filter({hasText:'Manual while-loop Mission'});
        await expect(row.getByTestId('history-manual-assessment')).toContainText('Graded');
        await expect(row.getByTestId('history-manual-assessment')).toContainText(complete?'Learning complete':'Needs more work');
        await row.scrollIntoViewIfNeeded();
        await history.screenshot({path:info.outputPath(complete?'history-graded-complete.png':'history-graded-needs-work.png')});
      } finally {await history.close();}
    }
    await assertHistoryOutcome(false);
    await page.screenshot({path:info.outputPath('live-grading-sidebar.png')});
    await liveDrawer.getByRole('button',{name:'Close grading',exact:true}).click();
    await expect(liveDrawer).toHaveCount(0);
    await expect(page.getByTestId('observation-connection')).toContainText('Live');
    await student.getByTestId('student-help-request').getByRole('button',{name:/Request help|도움 요청/}).click();
    await expect(page.getByRole('button',{name:/Help requests.*1 waiting/})).toBeVisible();
    // Tutoring opens the chosen student's saved work inside the still-mounted live session.
    await page.getByRole('button',{name:'Tutoring',exact:true}).click();
    await page.getByTestId('inline-tutoring').getByRole('button').filter({hasText:'Browser student'}).click();
    await expect(page.getByTestId('tutor-student-work')).toBeVisible();
    await page.getByRole('button',{name:'Edit grade',exact:true}).click();
    await expect(page.getByRole('button',{name:'Edit grade',exact:true})).toHaveCount(1);
    const tutoringDrawer=page.getByTestId('programming-grading-drawer');
    await tutoringDrawer.getByRole('textbox',{name:'Final score',exact:true}).fill('97');
    await tutoringDrawer.getByRole('textbox',{name:'Correction reason',exact:true}).fill('Reviewed together during tutoring.');
    await tutoringDrawer.getByRole('button',{name:'Update grade',exact:true}).click();
    await expect(student.getByTestId('programming-assessment')).toContainText('97 / 100');
    await page.screenshot({path:info.outputPath('tutoring-grading-sidebar.png')});
    await tutoringDrawer.getByRole('button',{name:'Close grading',exact:true}).click();
    await expect(tutoringDrawer).toHaveCount(0);
    // The selector can open an offline student's work for the displayed problem, with its own grade target.
    await page.getByRole('button',{name:/Switch student, current student/}).click();
    await page.getByRole('button').filter({hasText:'Offline review student'}).click();
    await page.getByRole('button',{name:'Grade submission',exact:true}).click();
    const offlineDrawer=page.getByTestId('programming-grading-drawer');
    await expect(offlineDrawer).toContainText('Offline review student');
    await offlineDrawer.getByText('View submitted code',{exact:true}).click();
    await expect(offlineDrawer.getByTestId('grading-submitted-code')).toHaveText('print("OFFLINE MANUAL SNAPSHOT")');
    await offlineDrawer.getByRole('textbox',{name:'Final score',exact:true}).fill('40');
    await offlineDrawer.getByRole('button',{name:'Publish grade',exact:true}).click();
    await expect(offlineDrawer.getByTestId('programming-assessment')).toContainText('40 / 100');
    await expect(student.getByTestId('programming-assessment')).toContainText('97 / 100');
    await page.screenshot({path:info.outputPath('selector-grading-sidebar.png')});
    await offlineDrawer.getByRole('button',{name:'Close grading',exact:true}).click();
    await expect(offlineDrawer).toHaveCount(0);
    await page.getByRole('button',{name:'Return to monitoring',exact:true}).click();
    await expect(page.getByTestId('inline-tutoring')).toHaveCount(0);
    await expect(page.getByTestId('observation-connection')).toContainText('Live');
    for (const [staff,score] of [[teacher,'98'],[lead,'99']] as const) {
      await staff.setViewportSize({width:1440,height:1000});await staff.goto(liveRoute);
      await expect(staff.getByTestId('observation-connection')).toContainText('Live');
      await expect(staff.getByTestId('student-current-material')).toContainText('Live on');
      await staff.getByRole('button',{name:'Edit grade',exact:true}).click();
      const grading=staff.getByTestId('programming-grading-drawer');
      await grading.getByRole('textbox',{name:'Final score',exact:true}).fill(score);
      await grading.getByRole('textbox',{name:'Correction reason',exact:true}).fill('Staff review from live monitoring.');
      if(score==='99')await grading.getByRole('radio',{name:'Learning complete',exact:true}).check();
      await grading.getByRole('button',{name:'Update grade',exact:true}).click();
      await expect(student.getByTestId('programming-assessment')).toContainText(score+' / 100');
      await expect(staff.getByTestId('observation-connection')).toContainText('Live');
    }
    await assertHistoryOutcome(true);
    await info.attach('navigation-aborts',{body:JSON.stringify(navigationAborts),contentType:'application/json'});
    expect(browserErrors).toEqual([]);
  }finally{await offlineContext.close();await studentContext.close();await leadContext.close();await teacherContext.close();}
});
