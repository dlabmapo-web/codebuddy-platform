import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { signInAs } from '../support/auth';
const fixture = process.env.E2E_MONITORING_HISTORY_FIXTURE
  ? JSON.parse(readFileSync(process.env.E2E_MONITORING_HISTORY_FIXTURE, 'utf8')) as { academyId: string; classId: string; membershipId: string; ids: Record<string,string> }
  : undefined;
test.skip(!fixture, 'Requires a separate development history fixture and prepared sessions');
const path = (key: string) => `/academy/development-academy/learn/exercises/${fixture!.ids[key]}?classId=${fixture!.classId}`;
const watch = () => `/academy/development-academy/teach/classes/${fixture!.classId}/students/${fixture!.membershipId}/live`;
async function text(page: Page): Promise<string | undefined> {
  return page.evaluate(() => {
    const api = (window as any).monaco;
    const editor = api?.editor.getEditors().find((editor: any) => editor.getDomNode()?.getBoundingClientRect().width);
    return editor?.getModel()?.getValue();
  });
}
async function write(page: Page, code: string) {
  await expect(page.locator('.monaco-editor').first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const editor = (window as any).monaco?.editor.getEditors().find((editor: any) => editor.getDomNode()?.getBoundingClientRect().width);
    if (!editor?.getModel()) return false;
    editor.focus(); editor.setSelection(editor.getModel().getFullModelRange()); return true;
  })).toBe(true);
  await page.keyboard.insertText(code);
  await expect.poll(() => text(page)).toBe(code);
}
async function select(page: Page, key: string) {
  const response = page.waitForResponse(response => response.url().endsWith('/monitoring/getExercisePreview')
    && response.request().postDataJSON()?.json?.materialId === fixture!.ids[key]);
  await page.locator('aside[data-collab-surface="curriculum"]').getByRole('button').filter({ hasText: 'History ' + key }).click();
  expect((await response).ok()).toBe(true);
}
for (const role of ['teacher', 'teamlead', 'manager']) test(`${role} sees saved previous work, submission fallback, blank drafts, and can return to live`, async ({ browser }, info) => {
  const studentContext = await browser.newContext();
  const teacherContext = await browser.newContext();
  const student = await studentContext.newPage(), teacher = await teacherContext.newPage();
  const errors: string[] = []; teacher.on('pageerror', error => errors.push(error.message));
  const saved = `# SAVED_PREVIOUS_${role}_${info.project.name}\nprint("student work")\n`;
  try {
    await signInAs({ page: student, identifier: 'student2@cove.test', password: 'CoveDev123!', initialPath: path('previous') });
    const savedResponse = student.waitForResponse(response => response.url().endsWith('/learn/saveDraft')
      && response.request().postDataJSON()?.json?.code === saved);
    await write(student, saved); expect((await savedResponse).ok()).toBe(true);
    await expect(student.getByText(/^Saved$|^저장됨$/).first()).toBeVisible();
    await student.goto(path('current'));
    await expect.poll(() => text(student)).toBe('# STARTER_current');
    await signInAs({ page: teacher, identifier: role + '@cove.test', password: 'CoveDev123!', initialPath: watch() });
    await expect.poll(() => text(teacher)).toBe('# STARTER_current');
    const outline = teacher.locator('aside[data-collab-surface="curriculum"]');
    await expect(outline).toBeVisible();
    for (const label of ['Saved work', 'Previous problems']) {
      const button = outline.getByRole('button').filter({ hasText: label }).first();
      if (await button.getAttribute('aria-expanded') === 'false') await button.click();
    }
    await select(teacher, 'previous');
    await expect.poll(() => text(teacher)).toBe(saved);
    const readonly = await teacher.evaluate(() => {
      const api = (window as any).monaco;
      return api.editor.getEditors().find((editor: any) => editor.getDomNode()?.getBoundingClientRect().width).getOption(api.editor.EditorOption.readOnly);
    });
    expect(readonly).toBe(true);
    await expect(teacher.getByRole('button', { name: /^Run$|^실행$/ })).toHaveCount(0);
    await expect(teacher.getByRole('button', { name: /^Submit$|^제출$/ })).toHaveCount(0);
    await expect.poll(() => text(student)).toBe('# STARTER_current');
    await teacher.screenshot({ path: info.outputPath('saved-previous-work.png') });
    for (const [key, expected] of [['submitted', '# LATEST_SUBMITTED_WORK'], ['untouched', '# STARTER_untouched'], ['empty', '']] as const) {
      await select(teacher, key); await expect.poll(() => text(teacher)).toBe(expected);
    }
    await select(teacher, 'previous'); await expect.poll(() => text(teacher)).toBe(saved);
    expect(await text(teacher)).not.toContain('OTHER_STUDENT_PRIVATE');
    await teacher.getByRole('button', { name: /Return to live|실시간.*돌아/ }).click();
    await expect.poll(() => text(teacher)).toBe('# STARTER_current');
    await student.goto(path('previous'));
    await expect.poll(() => text(student)).toBe(saved);
    expect(errors).toEqual([]);
  } finally { await teacherContext.close(); await studentContext.close(); }
});

for (const role of ['teacher', 'teamlead', 'manager']) test(`${role} can use authorized live editing`, async ({ browser }, info) => {
  const studentContext = await browser.newContext(), staffContext = await browser.newContext();
  const student = await studentContext.newPage(), staff = await staffContext.newPage();
  const original = '# STARTER_current';
  const changed = `# HELPED_BY_${role}_${info.project.name}\nprint("helping the student")\n`;
  try {
    await signInAs({ page: student, identifier: 'student2@cove.test', password: 'CoveDev123!', initialPath: path('current') });
    await expect.poll(() => text(student)).not.toBeUndefined();
    if (await text(student) !== original) {
      const saved = student.waitForResponse(r => r.url().endsWith('/learn/saveDraft') && r.request().postDataJSON()?.json?.code === original);
      await write(student, original); expect((await saved).ok()).toBe(true);
    }
    await signInAs({ page: staff, identifier: role + '@cove.test', password: 'CoveDev123!', initialPath: watch() });
    await expect.poll(() => text(staff)).toBe(original);
    const edit = staff.getByRole('button', { name: /^Edit code · Off$|코드 수정 · 꺼짐/i });
    await expect(edit).toBeEnabled(); await edit.click();
    await expect(staff.getByRole('button', { name: /^Edit code · On$|코드 수정 · 켜짐/i })).toBeVisible();
    for (const page of [student, staff]) await page.evaluate(() => {
      const editor = (window as any).monaco.editor.getEditors().find((e: any) => e.getDomNode()?.getBoundingClientRect().width);
      (window as any).__qaChanges = [];
      editor.getModel().onDidChangeContent((event: any) => (window as any).__qaChanges.push({ value: editor.getModel().getValue(), flush: event.isFlush, changes: event.changes }));
    });
    await write(staff, changed);
    await expect.poll(() => text(student)).toBe(changed);
    await expect(student.getByText(/teacher is helping|도와주고 있습니다/i)).toBeVisible();
    await staff.screenshot({ path: info.outputPath('staff-live-editing.png') });
    const studentEdit = changed + '# student continues\n';
    await write(student, studentEdit);
    await expect.poll(() => text(staff)).toBe(studentEdit);
    await write(staff, original);
    await expect.poll(() => text(student)).toBe(original);
    await expect(staff.getByText(/^Saved$|^저장됨$/).first()).toBeVisible();
  } finally {
    for (const [name, page] of [['student',student],['staff',staff]] as const)
      await info.attach(name+'-model-events', { body: JSON.stringify(await page.evaluate(() => (window as any).__qaChanges ?? [])), contentType: 'application/json' });
    await staffContext.close(); await studentContext.close();
  }
});
