import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { signInAs } from '../support/auth';
import { routes } from '../../packages/web/src/lib/routes';
const fixture=process.env.E2E_SUBMISSION_PDF_FIXTURE?JSON.parse(readFileSync(process.env.E2E_SUBMISSION_PDF_FIXTURE,'utf8')) as {materialId:string;classId:string}:undefined;
test.skip(!fixture,'Requires a fresh graded PDF fixture');
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
for(const role of ['student','teacher','teamlead','manager'])test(`${role}: graded PDF keeps Submit and precise persisted scores`,async({page},info)=>{
 const url=routes.academyLearnExercise('development-academy', fixture!.materialId, { classId: role === 'student' ? fixture!.classId : undefined });
 await signInAs({page,identifier:role+'@cove.test',password:'CoveDev123!',initialPath:url});
 await expect(page.getByTestId('exercise-reference-pane')).toBeVisible();
 await code(page,'print("hello")');
 const submit=page.getByRole('button',{name:'Submit',exact:true}),summary=page.getByTestId('latest-submission-summary');
 await expect(submit).toBeEnabled();await submit.click();await expect(summary).toContainText('8.5 / 25.5',{timeout:90000});
 await code(page,'print("wrong")');await expect(submit).toBeEnabled();await submit.click();await expect(summary).toContainText('0 / 25.5',{timeout:90000});
 await page.reload();await expect(summary).toContainText('0 / 25.5');
 await page.screenshot({path:info.outputPath(role+'-pdf-zero.png')});
});
