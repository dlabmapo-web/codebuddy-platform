import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { signInAs } from '../support/auth';
import { routes } from '../../packages/web/src/lib/routes';

// These are the seeded development accounts, never a production classroom.
const academySlug = 'development-academy';
const classId = 'e0000000-0000-4000-8000-000000000040';
const materialId = 'e0000000-0000-4000-8000-000000000031';
const membershipId = '40000000-0000-4000-8000-000000000102';
const exercise = routes.academyLearnExercise(academySlug, materialId, { classId });
const workspace = routes.academyTeachStudentLive(academySlug, classId, membershipId);
let studentContext: BrowserContext;
let teacherContext: BrowserContext;
let student: Page;
let original: string;

const text = (page: Page) => page.evaluate(() => (window as any).monaco?.editor.getModels()[0]?.getValue());
const edit = (page: Page, code: string) => page.evaluate(code => (window as any).monaco.editor.getModels()[0].setValue(code), code);
const toggle = (page: Page) => page.getByRole('button', { name: /^Edit code · Off$|코드 수정 · 꺼짐/i });

test.describe.configure({ mode: 'serial', timeout: 90_000 });
test.beforeAll(async ({ browser }) => {
  studentContext = await browser.newContext();
  teacherContext = await browser.newContext();
  student = await studentContext.newPage();
  await signInAs({ page: student, identifier: 'student2@cove.test', password: 'CoveDev123!', initialPath: exercise });
  await expect(student.locator('.monaco-editor').first()).toBeVisible({ timeout: 45_000 });
  await expect.poll(() => text(student), { timeout: 45_000 }).not.toBeUndefined();
  original = await text(student);
  await edit(student, '# recovery test\nprint(123)\n');
  const teacher = await teacherContext.newPage();
  await signInAs({ page: teacher, identifier: 'teacher@cove.test', password: 'CoveDev123!' });
  await teacher.close();
});
test.afterAll(async () => {
  try {
    if (original !== undefined && student && !student.isClosed()) {
      await edit(student, original);
      await expect(student.getByText(/^Saved$|^저장됨$/).first()).toBeVisible();
    }
  } finally {
    await teacherContext?.close();
    await studentContext?.close();
  }
});

test('lost initial sync acknowledgement recovers on the same connection', async () => {
  const page = await teacherContext.newPage();
  let syncs = 0;
  let connections = 0;
  const syncConnections: number[] = [];
  await page.routeWebSocket('**/socket.io/**', socket => {
    const connection = ++connections;
    const server = socket.connectToServer();
    let skipAttachments = 0;
    socket.onMessage(message => {
      if (skipAttachments > 0) { skipAttachments--; return; }
      if (typeof message === 'string' && message.includes('"document.sync"')) {
        syncs++;
        syncConnections.push(connection);
        if (syncs === 1) {
          skipAttachments = Number(/^45(\d+)-/.exec(message)?.[1] ?? 0);
          return; // No response at all; the compatibility broadcast cannot rescue it.
        }
      }
      server.send(message);
    });
  });
  try {
    await page.goto(workspace);
    await expect.poll(() => syncs).toBe(1);
    await expect(toggle(page)).toBeDisabled();
    await expect(toggle(page)).toBeEnabled({ timeout: 30_000 });
    expect(syncs).toBe(2);
    expect(syncConnections).toHaveLength(2);
    expect(syncConnections[1]).toBe(syncConnections[0]);
    await expect.poll(() => text(page)).toBe(await text(student));
  } finally { await page.close(); }
});

test('temporary watch outage exhausts retries and recovers through the visible retry control', async () => {
  const page = await teacherContext.newPage();
  let attempts = 0;
  let failing = true;
  await page.routeWebSocket('**/socket.io/**', socket => {
    const server = socket.connectToServer();
    socket.onMessage(message => {
      if (typeof message === 'string' && message.includes('"student.watch.start"')) {
        attempts++;
        if (failing) {
          const match = /^42(\/[^,]+,)(\d+)(\[.*)$/.exec(message);
          if (!match) throw new Error('Expected an acknowledged watch command');
          const [, payload] = JSON.parse(match[3]!);
          socket.send(`43${match[1]}${match[2]}${JSON.stringify([{ ok: false, eventId: payload.eventId, code: 'MONITORING_REALTIME_UNAVAILABLE' }])}`);
          return;
        }
      }
      server.send(message);
    });
  });
  try {
    await page.goto(workspace);
    await expect.poll(() => attempts).toBe(4);
    await expect(toggle(page)).toBeDisabled();
    const retry = page.getByRole('button', { name: /Retry connection|연결 다시 시도/i });
    await expect(retry).toBeVisible();
    failing = false;
    await retry.click();
    await expect(toggle(page)).toBeEnabled({ timeout: 30_000 });
    await expect(retry).toHaveCount(0);
    expect(attempts).toBe(5);
  } finally { await page.close(); }
});

test('an old persistence event cannot mark a newer deletion Saved', async () => {
  const page = await teacherContext.newPage();
  const held: string[] = [];
  let hold = false;
  let deliver = (_message: string) => {};
  await page.routeWebSocket('**/socket.io/**', socket => {
    const server = socket.connectToServer();
    deliver = message => socket.send(message);
    server.onMessage(message => {
      if (hold && typeof message === 'string' && message.includes('"document.persisted"')) {
        held.push(message);
      } else { socket.send(message); }
    });
  });
  try {
    await page.goto(workspace);
    await expect(toggle(page)).toBeEnabled({ timeout: 30_000 });
    hold = true;
    await edit(student, '# deletion durability\nprint(123)\n');
    await expect.poll(() => held.length).toBeGreaterThan(0);
    const old = held.shift()!;
    held.length = 0;
    await edit(student, '# deletion durability\nprint(12)\n');
    await expect.poll(() => text(page)).toBe('# deletion durability\nprint(12)\n');
    deliver(old);
    await expect(page.getByText(/Unsaved changes|저장되지 않은 변경/).first()).toBeVisible();
    await expect.poll(() => held.length).toBeGreaterThan(0);
    deliver(held.at(-1)!);
    await expect(page.getByText(/^Saved$|^저장됨$/).first()).toBeVisible();
  } finally { await page.close(); }
});
