import { execFileSync } from 'node:child_process';
import { test, expect, type Page } from '@playwright/test';
import { signInAs } from '../support/auth';

test.skip(process.env.E2E_PDF_GRADING !== '1', 'Opt-in local PDF grading fixture');
if (process.env.E2E_PDF_GRADING === '1' && !['localhost','127.0.0.1'].includes(new URL(process.env.E2E_BASE_URL ?? 'http://localhost:3000').hostname)) throw Error('Local only');
const academyId='20000000-0000-4000-8000-000000000001', courseId='ee090000-0000-4000-8000-000000000001', lectureId='ee090000-0000-4000-8000-000000000020', materialId='ee090000-0000-4000-8000-000000000030', classId='e0000000-0000-4000-8000-000000000040';
const root='/academy/development-academy', course=`${root}/learn/courses/${courseId}`, edit=`${root}/content/courses/${courseId}/lectures/${lectureId}/exercises/${materialId}`, learn=`${root}/learn/exercises/${materialId}?classId=${classId}`;
async function code(page: Page, value: string) {
  await expect(page.locator('.monaco-editor').first()).toBeVisible({timeout:90000});
  await expect.poll(() => page.evaluate(source => {
    const model=(window as unknown as {monaco?:{editor:{getModels():Array<{setValue(s:string):void}>}}}).monaco?.editor.getModels()[0];
    if (!model) return false; model.setValue(source); return true;
  }, value)).toBe(true);
}
async function save(page: Page) { const button=page.getByRole('button',{name:/^Save changes$/}); await expect(button).toBeEnabled(); await button.click(); await expect(page).toHaveURL(course,{timeout:60000}); }
async function result(page: Page, accepted: boolean) {
  await page.getByRole('button',{name:/^Submit$/}).click();
  await expect(page.getByTestId('result-hero').getByText(accepted ? /^Accepted$/ : /^Not accepted$/)).toBeVisible({timeout:90000});
  await expect(page.getByTestId('result-score')).toContainText(accepted ? '100 / 100' : '0 / 100');
}

test.describe.configure({ mode: 'serial' });
test.beforeAll(() => execFileSync('pnpm',['--filter','@cove/api','exec','tsx','scripts/seed-pdf-grading-e2e.mts'],{stdio:'pipe'}));
test('PDF practice runs without scores; automatic grading checks hidden cases; toggles preserve history and tests',async({page,browser},info)=>{
  test.setTimeout(360000); await page.setViewportSize({width:1440,height:1000});
  let staffAuth=''; page.on('request',request=>{if(request.headers().authorization)staffAuth=request.headers().authorization!;});
  await signInAs({page,identifier:'teamlead@cove.test',password:'CoveDev123!',initialPath:edit});
  await expect(page.getByRole('radio',{name:/^Practice only/})).toBeChecked();
  await expect(page.getByTestId('grading-cases')).toHaveCount(0);
  await expect.poll(() => staffAuth).not.toBe('');
  const staffDenied=await page.request.post('http://localhost:4000/api/rpc/learn/submitPractice',{headers:{Authorization:staffAuth},data:{json:{academyId,materialId,requestId:crypto.randomUUID(),code:'print("hello")'}}});
  expect(staffDenied.ok()).toBe(false); expect(await staffDenied.text()).toContain('EXERCISE_PRACTICE_ONLY');

  const context=await browser.newContext({viewport:{width:1440,height:1000}}),student=await context.newPage();
  let auth=''; student.on('request',request=>{if(request.headers().authorization)auth=request.headers().authorization!;});
  try {
    await signInAs({page:student,identifier:'student@cove.test',password:'CoveDev123!',initialPath:learn});
    await expect(student.getByText('Ungraded practice',{exact:true})).toBeVisible();
    await expect(student.getByRole('button',{name:/^Submit$|^Test run$/})).toHaveCount(0);
    await expect.poll(() => auth).not.toBe('');
    const denied=await student.request.post('http://localhost:4000/api/rpc/learn/submit',{headers:{Authorization:auth},data:{json:{academyId,classId,materialId,code:'print("hello")'}}});
    expect(denied.ok()).toBe(false); expect(await denied.text()).toContain('EXERCISE_PRACTICE_ONLY');
    const outline=await student.request.post('http://localhost:4000/api/rpc/learn/getCourseOutline',{headers:{Authorization:auth},data:{json:{academyId,classId,courseId}}});
    expect(outline.ok()).toBe(true); expect((await outline.json()).json.progress.total).toBe(0);
    await code(student,'print("practice works")');
    const run=student.getByRole('button',{name:/^Run$/});await expect(run).toBeEnabled({timeout:90000});await run.click();
    await expect(student.locator('#workspace-terminal-panel')).toContainText('practice works');
    await student.screenshot({path:info.outputPath('practice-only.png')});

    await page.getByRole('radio',{name:/^Automatic grading/}).click();
    await expect(page.getByTestId('grading-cases')).toBeVisible();
    await expect(page.getByRole('textbox',{name:'Expected text',exact:true})).toHaveValue('hello');
    await save(page);
    await student.reload();
    await expect(student.getByText('Automatically graded · Up to 100 points',{exact:true})).toBeVisible();
    await expect(student.getByRole('button',{name:/^Test run$/})).toHaveCount(0);
    const bootstrap=await student.request.post('http://localhost:4000/api/rpc/learn/getExerciseBootstrap',{headers:{Authorization:auth},data:{json:{academyId,classId,materialId}}});
    const body=(await bootstrap.json()).json; expect(body.workspace.exercise.sampleTestCases).toEqual([]); expect(JSON.stringify(body)).not.toContain('expectedOutput');
    await code(student,'print("wrong")'); await result(student,false);
    await code(student,'print("prefix hello suffix")'); await result(student,true);
    await student.screenshot({path:info.outputPath('automatic-result.png')});

    await page.goto(edit);await page.getByRole('radio',{name:/^Practice only/}).click();await save(page);
    await student.reload();await expect(student.getByRole('button',{name:/^Submit$/})).toHaveCount(0);
    await page.goto(edit);await page.getByRole('radio',{name:/^Automatic grading/}).click();
    await expect(page.getByRole('textbox',{name:'Expected text',exact:true})).toHaveValue('hello');await save(page);
    await student.reload();await expect(student.getByRole('button',{name:/^Submit$/})).toBeEnabled();
    const restored=await student.request.post('http://localhost:4000/api/rpc/learn/getCourseOutline',{headers:{Authorization:auth},data:{json:{academyId,classId,courseId}}});
    expect((await restored.json()).json.progress).toMatchObject({total:1,solved:1});
    await page.goto(edit);await page.setViewportSize({width:390,height:844});await expect(page.getByRole('radio',{name:/^Automatic grading/})).toBeVisible();await page.screenshot({path:info.outputPath('grading-mobile.png'),fullPage:true});
  } finally {await context.close();}
});


test('creating PDF practice needs no duplicate statement; automatic setup validates cases and preserves advanced data', async ({page}, info) => {
  test.setTimeout(180000);
  await signInAs({page,identifier:'teamlead@cove.test',password:'CoveDev123!',initialPath:`${root}/content/courses/${courseId}/lectures/${lectureId}/exercises/new?referencePdf=required`});
  const create=page.getByRole('button',{name:'Create problem',exact:true});
  await expect(create).toBeDisabled();
  await page.getByRole('button',{name:'Reference PDF',exact:true}).click();
  await page.getByRole('menuitemradio',{name:/^Grading reference PDF/}).click();
  const title=page.getByRole('textbox',{name:/Problem title/});
  await expect(title).toHaveValue('Grading reference PDF');
  await expect(create).toBeEnabled();
  const name=`E2E PDF playground ${Date.now()}`;await title.fill(name);
  await page.getByRole('radio',{name:/^Automatic grading/}).click();
  await expect(create).toBeDisabled();
  await expect(page.getByRole('textbox',{name:'Expected output',exact:true})).toBeFocused();
  await page.getByRole('textbox',{name:'Expected output',exact:true}).fill('hello');
  await expect(create).toBeEnabled();
  await expect(page.getByRole('spinbutton',{name:'Points',exact:true})).toHaveValue('100');
  await page.getByRole('button',{name:'Add test case',exact:true}).click();
  await expect(create).toBeDisabled();
  await expect(page.getByText(/Test points exceed the maximum/)).toBeVisible();
  await page.getByRole('textbox',{name:'Expected output',exact:true}).nth(1).fill('hello');
  await page.getByRole('radio',{name:/^Practice only/}).click();
  await expect(page.getByTestId('grading-cases')).toHaveCount(0);
  await expect(create).toBeEnabled();await create.click();await expect(page).toHaveURL(course,{timeout:60000});
  await page.getByRole('link',{name,exact:true}).click();
  await expect(page.getByText('Ungraded practice',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:/^Submit$/})).toHaveCount(0);
  await page.getByRole('link',{name:'Edit',exact:true}).click();
  await page.getByRole('radio',{name:/^Automatic grading/}).click();
  await expect(page.getByRole('textbox',{name:'Expected output',exact:true})).toHaveCount(2);
  await expect(page.getByRole('spinbutton',{name:'Points',exact:true}).nth(1)).toHaveValue('100');
  await page.screenshot({path:info.outputPath('new-automatic-grading.png'),fullPage:true});
});


test('teacher can inspect grading practice without authoring controls', async ({page}) => {
  await signInAs({page,identifier:'teacher@cove.test',password:'CoveDev123!',initialPath:`${root}/learn/exercises/${materialId}`});
  await expect(page.getByRole('banner').getByText('Staff practice',{exact:true})).toBeVisible();
  await expect(page.getByText('Automatically graded · Up to 100 points',{exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'Edit',exact:true})).toHaveCount(0);
  await page.getByRole('link',{name:'Review details',exact:true}).click();
  await expect(page.getByRole('radio',{name:/^Automatic grading/})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Save changes',exact:true})).toHaveCount(0);
});
