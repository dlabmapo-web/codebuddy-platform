import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { signInAs } from '../support/auth';
import { routes } from '../../packages/web/src/lib/routes';

const slug = 'development-academy';
const classId = 'e0000000-0000-4000-8000-000000000040';
const materialId = 'e0000000-0000-4000-8000-000000000031';
const ids = ['40000000-0000-4000-8000-000000000102', '40000000-0000-4000-8000-000000000103'];
const url = (index: number) => routes.academyTeachStudentLive(slug, classId, ids[index]!);
const text = (page: Page) => page.evaluate(() => (window as any).monaco?.editor.getModels()[0]?.getValue());
const edit = (page: Page, code: string) => page.evaluate(code => {
  const editor = (window as any).monaco.editor.getEditors()[0];
  editor.executeEdits('e2e', [{ range: editor.getModel().getFullModelRange(), text: code }]);
}, code);
const ready = async (page: Page) => {
  await expect(page.getByRole('button', { name: /^Read-only$|읽기 전용/i })).toBeEnabled({ timeout: 45_000 });
  // Document sync can finish before the lazy Monaco bundle mounts.
  await expect(page.locator('.monaco-editor').first()).toBeVisible();
  await expect.poll(() => text(page)).not.toBeUndefined();
};
const switcher = (page: Page) => page.getByRole('button', { name: /Switch student,|학생 전환,/ });
const panel = (page: Page) => page.getByRole('dialog');
let teacherContext: BrowserContext;
const contexts: BrowserContext[] = [];
const students: Page[] = [];
const originals: string[] = [];

test.describe.configure({ mode: 'serial', timeout: 120_000 });
test.beforeAll(async ({ browser }) => {
  for (let index = 0; index < 2; index++) {
    const context = await browser.newContext();
    contexts.push(context);
    const page = await context.newPage();
    students.push(page);
    await signInAs({ page, identifier: `student${index + 2}@cove.test`, password: 'CoveDev123!', initialPath: routes.academyLearnExercise(slug, materialId, { classId }) });
    await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 45_000 });
    await expect.poll(() => text(page)).not.toBeUndefined();
    originals.push(await text(page));
    await edit(page, `# switcher student ${index}\nprint(${index})\n`);
  }
  teacherContext = await browser.newContext();
  const page = await teacherContext.newPage();
  await signInAs({ page, identifier: 'teacher@cove.test', password: 'CoveDev123!' });
  await page.close();
});
test.afterAll(async () => {
  await teacherContext?.close();
  for (let i = 0; i < students.length; i++) {
    if (originals[i] !== undefined) {
      await edit(students[i]!, originals[i]!);
      await expect(students[i]!.getByText(/^Saved$|^저장됨$/).first()).toBeVisible();
    }
    await contexts[i]?.close();
  }
});

async function open(page: Page) {
  await switcher(page).click();
  await expect(panel(page).locator(`a[href="${url(1)}"]`).first()).toBeVisible();
}
async function select(page: Page, index: number) {
  await switcher(page).click();
  await panel(page).locator(`a[href="${url(index)}"]:not([target])`).click();
  await expect(page).toHaveURL(new RegExp(ids[index]!));
  await ready(page);
}

test('switcher keeps scoped notes, independent tabs, readonly visits and browser history', async () => {
  const page = await teacherContext.newPage();
  const other = await teacherContext.newPage();
  let originalStarts = 0;
  await page.routeWebSocket('**/socket.io/**', socket => {
    const server = socket.connectToServer();
    socket.onMessage(message => {
      if (typeof message === 'string' && message.includes('\"student.watch.start\"')) originalStarts++;
      server.send(message);
    });
  });
  try {
    await page.goto(url(0)); await ready(page);
    await other.goto(url(0)); await ready(other);
    await page.getByRole('button', { name: /^Read-only$|읽기 전용/i }).click();
    await expect(page.getByRole('button', { name: /Help \/ Edit code|도움/ })).toBeVisible();
    const input = page.locator('textarea').last();
    await input.fill('Unsent note for A');
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('link', { name: /^Back to class$|^수업으로 돌아가기$/ }).click();
    await expect(page).toHaveURL(new RegExp(ids[0]!));
    await expect(input).toHaveValue('Unsent note for A');
    await open(page);
    expect(await panel(page).getByRole('listitem').count()).toBeGreaterThanOrEqual(15);
    await expect(panel(page).getByRole('textbox')).toBeFocused();
    const startsBeforePopup = originalStarts;
    const popupPromise = page.waitForEvent('popup');
    await panel(page).locator(`a[href="${url(1)}"][target="_blank"]`).click();
    const popup = await popupPromise;
    await ready(popup);
    await expect(page).toHaveURL(new RegExp(ids[0]!));
    await expect(panel(page)).toBeVisible();
    await expect(input).toHaveValue('Unsent note for A');
    expect(originalStarts).toBe(startsBeforePopup);
    await expect(page.getByRole('button', { name: /Help \/ Edit code|도움/ })).toBeVisible();
    await popup.close();
    await panel(page).locator(`a[href="${url(1)}"]:not([target])`).click();
    await ready(page);
    await expect(page).toHaveURL(new RegExp(ids[1]!));
    await expect.poll(() => text(page)).toBe(await text(students[1]!));
    await page.locator('textarea').last().fill('Unsent note for B');
    await select(page, 0);
    await expect(page.locator('textarea').last()).toHaveValue('Unsent note for A');
    await expect.poll(() => text(other)).toBe(await text(students[0]!));
    await page.goBack(); await ready(page);
    await expect(page).toHaveURL(new RegExp(ids[1]!));
    await expect(page.locator('textarea').last()).toHaveValue('Unsent note for B');
    await page.goForward(); await ready(page);
    await expect(page.locator('textarea').last()).toHaveValue('Unsent note for A');
  } finally { await page.close(); await other.close(); }
});

test('search, current selection, keyboard and narrow panel do not replace the watch', async () => {
  const page = await teacherContext.newPage();
  let watches = 0;
  await page.routeWebSocket('**/socket.io/**', socket => {
    const server = socket.connectToServer();
    socket.onMessage(message => {
      if (typeof message === 'string' && message.includes('"student.watch.start"')) watches++;
      server.send(message);
    });
  });
  try {
    await page.goto(url(0)); await ready(page);
    const initial = watches;
    const longCode = Array.from({ length: 90 }, (_, i) => `# reading line ${i + 1}`).join('\n');
    await edit(students[0]!, longCode);
    await expect.poll(() => text(page)).toBe(longCode);
    await page.evaluate(() => {
      const editor = (window as any).monaco.editor.getEditors()[0];
      (window as any).__switcherOriginalEditor = editor;
      editor.setScrollTop(500);
    });
    const scroll = () => page.evaluate(() => (window as any).monaco.editor.getEditors()[0].getScrollTop());
    const beforeScroll = await scroll();
    expect(beforeScroll).toBeGreaterThan(0);
    await open(page);
    await panel(page).getByRole('textbox').fill('no-such-student-unique');
    await expect(panel(page).getByText(/No students match|검색 결과/)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(switcher(page)).toBeFocused();
    await open(page);
    await panel(page).getByRole('button', { name: /Current|현재/ }).click();
    expect(watches).toBe(initial);
    expect(await scroll()).toBe(beforeScroll);
    expect(await page.evaluate(() => (window as any).__switcherOriginalEditor === (window as any).monaco.editor.getEditors()[0])).toBe(true);
    await page.setViewportSize({ width: 900, height: 700 });
    await open(page);
    const box = await panel(page).boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(12);
    expect(box!.x + box!.width).toBeLessThanOrEqual(888);
    expect(box!.height).toBeLessThanOrEqual(480);
    await page.screenshot({ path: `test-results/student-switcher-${test.info().project.name}.png` });
  } finally { await page.close(); }
});

test('lost teacher update acknowledgement preserves code and retry switches only after acceptance', async () => {
  const page = await teacherContext.newPage();
  let block = false;
  let dropped = 0;
  await page.routeWebSocket('**/socket.io/**', socket => {
    const server = socket.connectToServer();
    let attachments = 0;
    socket.onMessage(message => {
      if (attachments > 0) { attachments--; return; }
      if (block && typeof message === 'string' && message.includes('"document.update"')) {
        attachments = Number(/^45(\d+)-/.exec(message)?.[1] ?? 0);
        dropped++;
        return;
      }
      server.send(message);
    });
  });
  try {
    await page.goto(url(0)); await ready(page);
    await page.getByRole('button', { name: /^Read-only$|읽기 전용/i }).click();
    await expect(page.getByRole('button', { name: /Help \/ Edit code|도움/ })).toBeVisible();
    block = true;
    const code = '# pending teacher edit\nprint(987)\n';
    await edit(page, code);
    await expect.poll(() => dropped).toBeGreaterThan(0);
    await open(page);
    await panel(page).locator(`a[href="${url(1)}"]:not([target])`).click();
    await expect(panel(page).getByRole('button', { name: /Retry switch|전환 다시/ })).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(new RegExp(ids[0]!));
    expect(await text(page)).toBe(code);
    block = false;
    await panel(page).getByRole('button', { name: /Retry switch|전환 다시/ }).click();
    await expect(page).toHaveURL(new RegExp(ids[1]!));
    await ready(page);
    await expect.poll(() => text(students[0]!)).toBe(code);
    await select(page, 0);
    await expect.poll(() => text(page)).toBe(code);
  } finally { await page.close(); }
});

for (const switching of [false, true]) {
  test(`reconnect retains an undelivered teacher edit${switching ? ' and unblocks switching students' : ''}`, async () => {
    const page = await teacherContext.newPage();
    let block = false;
    let dropped = 0;
    let disconnect: (() => Promise<void>) | undefined;
    await page.routeWebSocket('**/socket.io/**', socket => {
      const server = socket.connectToServer();
      let attachments = 0;
      socket.onMessage(message => {
        if (typeof message === 'string' && message.includes('"student.watch.start"')) {
          disconnect = async () => { await server.close(); await socket.close(); };
        }
        if (attachments) { attachments--; return; }
        if (block && typeof message === 'string' && message.includes('"document.update"')) {
          attachments = Number(/^45(\d+)-/.exec(message)?.[1] ?? 0);
          dropped++;
          return;
        }
        server.send(message);
      });
    });
    try {
      await page.goto(url(0)); await ready(page);
      const baseline = await text(page);
      const code = baseline + `\n# retained through reconnect ${switching}\n`;
      await page.getByRole('button', { name: /^Read-only$|읽기 전용/i }).click();
      await expect(page.getByRole('button', { name: /Help \/ Edit code|도움/ })).toHaveAttribute('aria-pressed', 'true');
      block = true;
      await edit(page, code);
      await expect.poll(() => dropped).toBeGreaterThan(0);
      expect(await text(students[0]!)).toBe(baseline);
      if (switching) {
        await open(page);
        await panel(page).locator(`a[href="${url(1)}"]:not([target])`).click();
        await expect(panel(page).getByRole('button', { name: /Retry switch|전환 다시/ })).toBeVisible({ timeout: 15_000 });
      }
      block = false;
      expect(disconnect).toBeDefined();
      await disconnect!();
      await expect.poll(() => text(students[0]!), { timeout: 45_000 }).toBe(code);
      if (switching) {
        await panel(page).getByRole('button', { name: /Retry switch|전환 다시/ }).click();
        await expect(page).toHaveURL(new RegExp(ids[1]!));
        await ready(page);
        await expect.poll(() => text(page)).toBe(await text(students[1]!));
      } else {
        await ready(page);
        await expect.poll(() => text(page)).toBe(code);
      }
    } catch (error) {
      console.log('Recovery failure UI:', await page.locator('body').innerText());
      throw error;
    } finally { await page.close(); }
  });
}

test('a missing roster snapshot disables destinations without disabling the live editor', async () => {
  const page = await teacherContext.newPage();
  let hold = true;
  let snapshots = 0;
  await page.routeWebSocket('**/socket.io/**', socket => {
    const server = socket.connectToServer();
    server.onMessage(message => {
      if (hold && typeof message === 'string' && message.includes('"class.snapshot"')) { snapshots++; return; }
      socket.send(message);
    });
  });
  try {
    await page.goto(url(0)); await ready(page);
    await switcher(page).click();
    await expect.poll(() => snapshots).toBeGreaterThan(0);
    await expect(panel(page).getByText(/Updating student|학생 상태/).first()).toBeVisible();
    await expect(panel(page).locator('a')).toHaveCount(0);
    await ready(page);
    hold = false;
    await panel(page).getByRole('button', { name: /^Retry$|^다시 시도$/ }).click();
    await expect(panel(page).locator(`a[href="${url(1)}"]`).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect.poll(() => text(page)).toBe(await text(students[0]!));
  } finally { await page.close(); }
});

test('a roster request error can retry without replacing the current document', async () => {
  const page = await teacherContext.newPage();
  const pattern = '**/api/rpc/monitoring/getClassRoster**';
  await page.route(pattern, route => route.abort());
  try {
    await page.goto(url(0)); await ready(page);
    const before = await text(page);
    await switcher(page).click();
    await expect(panel(page).getByText(/Student list unavailable|학생 목록을/)).toBeVisible();
    await ready(page);
    await page.unroute(pattern);
    await panel(page).getByRole('button', { name: /^Retry$|^다시 시도$/ }).click();
    await expect(panel(page).locator(`a[href="${url(1)}"]`).first()).toBeVisible();
    expect(await text(page)).toBe(before);
  } finally { await page.close(); }
});

test('Stay cancels a pending switch even when its acknowledgement arrives later', async () => {
  const page = await teacherContext.newPage();
  let hold = false;
  const held: Array<() => void> = [];
  await page.routeWebSocket('**/socket.io/**', socket => {
    const server = socket.connectToServer();
    const ids = new Set<string>();
    socket.onMessage(message => {
      if (hold && typeof message === 'string' && message.includes('"document.update"')) {
        const match = /^45\d+-(\/[^,]+,)(\d+)/.exec(message);
        if (match) ids.add(`${match[1]}${match[2]}`);
      }
      server.send(message);
    });
    server.onMessage(message => {
      if (typeof message === 'string' && [...ids].some(id => message.startsWith(`43${id}[`))) {
        held.push(() => socket.send(message)); return;
      }
      socket.send(message);
    });
  });
  try {
    await page.goto(url(0)); await ready(page);
    await page.getByRole('button', { name: /^Read-only$|읽기 전용/i }).click();
    await expect(page.getByRole('button', { name: /Help \/ Edit code|도움/ })).toBeVisible();
    hold = true;
    await edit(page, '# cancelled switch\nprint(777)\n');
    await expect.poll(() => held.length).toBeGreaterThan(0);
    await open(page);
    await panel(page).locator(`a[href="${url(1)}"]:not([target])`).click();
    await panel(page).getByRole('button', { name: /Stay here|현재 화면 유지/ }).click();
    hold = false;
    held.forEach(deliver => deliver());
    await expect.poll(() => text(students[0]!)).toBe('# cancelled switch\nprint(777)\n');
    await expect(page).toHaveURL(new RegExp(ids[0]!));
    await panel(page).getByRole('button', { name: /Current|현재/ }).click();
    await expect(switcher(page)).toBeFocused();
  } finally { await page.close(); }
});

test('delayed feedback acknowledgement preserves a newer note through A to B to A', async () => {
  const page = await teacherContext.newPage();
  let acknowledge: (() => void) | undefined;
  await page.routeWebSocket('**/socket.io/**', socket => {
    const server = socket.connectToServer();
    socket.onMessage(message => {
      if (typeof message === 'string' && message.includes('"feedback.send"')) {
        const match = /^42(\/[^,]+,)(\d+)(\[.*)$/.exec(message);
        if (!match) throw new Error('Expected acknowledged feedback command');
        const [, payload] = JSON.parse(match[3]!);
        acknowledge = () => socket.send(`43${match[1]}${match[2]}${JSON.stringify([{ ok: true, eventId: payload.eventId, data: { feedbackId: '00000000-0000-4000-8000-000000000001' } }])}`);
        return; // Exercise delayed UI acknowledgement without changing stored feedback.
      }
      server.send(message);
    });
  });
  try {
    await page.goto(url(0)); await ready(page);
    await page.locator('textarea').last().fill('Earlier version');
    // The development query inspector floats over the bottom-right save button.
    // Use the composer's supported keyboard action.
    await page.locator('textarea').last().press('Control+Enter');
    await expect.poll(() => Boolean(acknowledge)).toBe(true);
    await page.locator('textarea').last().fill('Newer version');
    acknowledge!();
    await select(page, 1);
    await page.locator('textarea').last().fill('Student B note');
    await select(page, 0);
    await expect(page.locator('textarea').last()).toHaveValue('Newer version');
  } finally { await page.close(); }
});

test('a rejected pending edit stays visible and cannot silently unlock when choosing Stay', async () => {
  const page = await teacherContext.newPage();
  let block = false;
  const protocol: string[] = [];
  const refuse: Array<() => void> = [];
  await page.routeWebSocket('**/socket.io/**', socket => {
    const server = socket.connectToServer();
    let attachments = 0;
    const acknowledgements = new Set<string>();
    server.onMessage(message => {
      if (typeof message === 'string' && (message.includes('watch.mode.changed') || [...acknowledgements].some(id => message.startsWith(`43${id}[`)))) protocol.push(message);
      socket.send(message);
    });
    socket.onMessage(message => {
      if (typeof message === 'string' && (message.includes('watch.mode') || message.includes('student.watch.start'))) {
        protocol.push(message);
        const match = /^42(\/[^,]+,)(\d+)/.exec(message);
        if (match) acknowledgements.add(`${match[1]}${match[2]}`);
      }
      if (attachments > 0) { attachments--; return; }
      if (block && typeof message === 'string' && message.includes('"document.update"')) {
        const match = /^45(\d+)-(\/[^,]+,)(\d+)(\[.*)$/.exec(message);
        if (!match) throw new Error('Expected binary document command');
        attachments = Number(match[1]);
        const [, payload] = JSON.parse(match[4]!);
        refuse.push(() => socket.send(`43${match[2]}${match[3]}${JSON.stringify([{ ok: false, eventId: payload.eventId, code: 'MONITORING_REALTIME_UNAVAILABLE' }])}`));
        return;
      }
      server.send(message);
    });
  });
  try {
    await page.goto(url(0)); await ready(page);
    await page.getByRole('button', { name: /^Read-only$|읽기 전용/i }).click();
    await expect(page.getByRole('button', { name: /Help \/ Edit code|도움/ }), JSON.stringify(protocol)).toBeVisible();
    block = true;
    const code = '# retained rejected update\nprint(998)\n';
    await edit(page, code);
    await expect.poll(() => refuse.length).toBeGreaterThan(0);
    await open(page);
    await panel(page).locator(`a[href="${url(1)}"]:not([target])`).click();
    refuse.forEach(reply => reply());
    await expect(panel(page).getByRole('button', { name: /Retry switch|전환 다시/ })).toBeVisible();
    await panel(page).getByRole('button', { name: /Stay here|현재 화면 유지/ }).click();
    await expect(page).toHaveURL(new RegExp(ids[0]!));
    expect(await text(page)).toBe(code);
    expect(await page.evaluate(() => {
      const monaco = (window as any).monaco;
      return monaco.editor.getEditors()[0].getOption(monaco.editor.EditorOption.readOnly);
    })).toBe(true);
    block = false;
    await panel(page).locator(`a[href="${url(1)}"]:not([target])`).click();
    await expect(page).toHaveURL(new RegExp(ids[1]!));
    await ready(page);
    await expect.poll(() => text(students[0]!)).toBe(code);
  } finally { await page.close(); }
});

test('an unavailable student destination retains the authorized class switcher', async () => {
  const page = await teacherContext.newPage();
  try {
    await page.goto(routes.academyTeachStudentLive(slug, classId, '00000000-0000-4000-8000-000000000099'));
    await expect(switcher(page)).toBeVisible();
    await expect(page.locator('.monaco-editor')).toHaveCount(0);
    await switcher(page).click();
    await panel(page).locator(`a[href="${url(0)}"]:not([target])`).click();
    await expect(page).toHaveURL(new RegExp(ids[0]!));
    await ready(page);
    await expect.poll(() => text(page)).toBe(await text(students[0]!));
  } finally { await page.close(); }
});
