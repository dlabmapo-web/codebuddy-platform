import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { signInAs } from '../support/auth';
import { routes } from '../../packages/web/src/lib/routes';
const fixture = process.env.E2E_SUBMISSION_FIXTURE ? JSON.parse(readFileSync(process.env.E2E_SUBMISSION_FIXTURE, 'utf8')) as { classId: string; ids: Record<string,string> } : undefined;
test.skip(!fixture?.ids.quiz || !fixture?.ids.weighted, 'Requires the isolated submission fixture');
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
for (const role of ['student','teacher','teamlead','manager']) test(`${role}: legacy quiz and decimal weighted latest scores`, async ({ page }, info) => {
 const url = (key:string) => routes.academyLearnExercise('development-academy', fixture!.ids[key], { classId: role === 'student' ? fixture!.classId : undefined });
 await signInAs({ page, identifier: role+'@cove.test', password: 'CoveDev123!', initialPath: url('quiz') });
 const summary = page.getByTestId('latest-submission-summary');
 const submit = page.getByRole('button', { name: role === 'student' ? 'Submit answer' : 'Submit', exact: true });
 await page.getByRole('radio', { name: 'Python', exact: true }).check(); await submit.click();
 await expect(summary).toContainText('100 / 100', { timeout: 60000 });
 if (role === 'student') await page.getByRole('button', { name: 'Try again', exact: true }).click();
 await page.getByRole('radio', { name: 'Other', exact: true }).check(); await submit.click();
 await expect(summary).toContainText('0 / 100', { timeout: 60000 });
 await page.reload(); await expect(summary).toContainText('0 / 100');
 await page.goto(url('weighted')); await code(page, 'print("hello")');
 await page.getByRole('button', { name: 'Submit', exact: true }).click();
 await expect(summary).toContainText('8.5 / 25.5', { timeout: 90000 });
 await page.reload(); await expect(summary).toContainText('8.5 / 25.5');
 await page.screenshot({ path: info.outputPath(role+'-weighted-summary.png') });
});
