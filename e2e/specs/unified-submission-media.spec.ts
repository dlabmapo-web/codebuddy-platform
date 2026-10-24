import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { signInAs } from '../support/auth';
const fixture = process.env.E2E_SUBMISSION_MEDIA_FIXTURE ? JSON.parse(readFileSync(process.env.E2E_SUBMISSION_MEDIA_FIXTURE, 'utf8')) as { classId:string; materials:Array<{type:'documents'|'videos';id:string}> } : undefined;
test.skip(!fixture, 'Requires authorized ready reading-only media fixtures');
for (const role of ['student','teacher','teamlead','manager']) test(`${role}: reading-only PDF and video have no Submit or score strip`, async ({ page }) => {
 for (const [index, material] of fixture!.materials.entries()) {
  const path = `/academy/development-academy/learn/${material.type}/${material.id}${role === 'student' ? '?classId='+fixture!.classId : ''}`;
  const response = page.waitForResponse(r => r.request().method()==='GET' && r.url().includes(`/api/${material.type}?`) && r.url().includes(material.id));
  if (index===0) await signInAs({page,identifier:role+'@cove.test',password:'CoveDev123!',initialPath:path});
  else await page.goto(path);
  const result=await response; expect(result.status()).toBe(200);
  const data=await result.json(); await expect(page.getByRole('heading',{name:data.title,exact:true,level:1})).toBeVisible();
  await expect(page.getByRole('button',{name:/submit/i})).toHaveCount(0);
  await expect(page.getByTestId('latest-submission-summary')).toHaveCount(0);
 }
});
