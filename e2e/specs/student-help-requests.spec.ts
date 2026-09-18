import { expect, test, type BrowserContext, type Route } from '@playwright/test';
import type { HelpRequest } from '../../packages/shared/src/monitoring/help-requests';
import { signInAs } from '../support/auth';
import { routes } from '../../packages/web/src/lib/routes';

// UI contract coverage uses controlled help responses, so no migration or queue
// mutation hits the configured development Supabase database. The same lifecycle
// is separately exercised against real PostgreSQL by help-request.integration.
const academyId = '20000000-0000-4000-8000-000000000001';
const classId = 'e0000000-0000-4000-8000-000000000040';
const materialId = 'e0000000-0000-4000-8000-000000000031';
const studentMembershipRef = '40000000-0000-4000-8000-000000000102';
const slug = 'development-academy';

test('request, teacher queue, claim, resolve and cancellation remain separate from editing', async ({ browser }, testInfo) => {
  test.setTimeout(150_000);
  let request: HelpRequest | null = null;
  let latestClosed: HelpRequest | null = null;
  const now = () => new Date().toISOString();
  const mutations: string[] = [];
  let failNextCreate = false;
  const createKeys: string[] = [];
  async function handler(route: Route) {
    const method = new URL(route.request().url()).pathname.split('/').at(-1)!;
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } }); return; }
    if (!['getMyActiveHelpRequest', 'requestHelp', 'listClassHelpRequests', 'claimHelpRequest', 'returnHelpRequest', 'resolveHelpRequest', 'cancelMyHelpRequest'].includes(method)) { await route.continue(); return; }
    const input = route.request().postDataJSON()?.json ?? {};
    let result: unknown;
    if (method === 'getMyActiveHelpRequest') result = { request, latestClosed, teacherAssigned: true, serverTime: now() };
    else if (method === 'listClassHelpRequests') result = { requests: request?.status === input.status ? [request] : [], waitingCount: request?.status === 'WAITING' ? 1 : 0, inProgressCount: request?.status === 'IN_PROGRESS' ? 1 : 0, nextCursor: null, serverTime: now() };
    else {
      mutations.push(method);
      if (method === 'requestHelp') {
        createKeys.push(input.idempotencyKey);
        if (!request) request = { id: '10000000-0000-4000-8000-000000000001', academyId, classId, studentMembershipRef, studentName: 'Help queue student', materialId, problemTitle: 'Sum two numbers', teacherMembershipRef: null, teacherName: null, status: 'WAITING', version: 1, requestedAt: new Date(Date.now() - 135_000).toISOString(), claimedAt: null, closedAt: null, closeReason: null };
        if (failNextCreate) { failNextCreate = false; await route.abort(); return; }
      } else if (request) {
        request = { ...request, version: request.version + 1 };
        if (method === 'claimHelpRequest') request = { ...request, status: 'IN_PROGRESS', teacherName: 'Queue teacher', teacherMembershipRef: '10000000-0000-4000-8000-000000000002', claimedAt: now() };
        if (method === 'returnHelpRequest') request = { ...request, status: 'WAITING', teacherName: null, teacherMembershipRef: null, claimedAt: null };
        if (method === 'resolveHelpRequest' || method === 'cancelMyHelpRequest') {
          latestClosed = { ...request, status: method === 'resolveHelpRequest' ? 'RESOLVED' : 'CANCELLED', closedAt: now() };
          request = null;
        }
      }
      result = { request: request ?? latestClosed, conflict: false, serverTime: now() };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: JSON.stringify({ json: result }) });
  }
  const contexts: BrowserContext[] = [];
  try {
    const studentContext = await browser.newContext(); contexts.push(studentContext);
    const teacherContext = await browser.newContext(); contexts.push(teacherContext);
    await studentContext.route('**/api/rpc/monitoring/*', handler);
    await teacherContext.route('**/api/rpc/monitoring/*', handler);
    const student = await studentContext.newPage();
    await signInAs({ page: student, identifier: 'student2@cove.test', password: 'CoveDev123!', initialPath: routes.academyLearnExercise(slug, materialId, { classId }) });
    const control = student.getByTestId('student-help-request');
    await expect(control.getByRole('button', { name: /^Request help$|도움 요청하기/ })).toBeEnabled({ timeout: 45_000 });
    await control.getByRole('button', { name: /^Request help$|도움 요청하기/ }).click();
    await expect(control.getByRole('button', { name: /Cancel request|요청 취소/ })).toBeVisible();
    await student.reload();
    await expect(control.getByText(/Waiting|대기 중/)).toBeVisible();
    const teacher = await teacherContext.newPage();
    await signInAs({ page: teacher, identifier: 'teacher@cove.test', password: 'CoveDev123!', initialPath: routes.academyTeachStudentLive(slug, classId, studentMembershipRef) });
    const edit = teacher.getByRole('button', { name: /Edit code · Off|코드 수정 · 꺼짐/ });
    await expect(edit).toBeVisible({ timeout: 45_000 });
    await teacher.getByRole('button', { name: /Help requests · 1 waiting|도움 요청 · 대기 1명/ }).click();
    const queue = teacher.getByTestId('help-queue');
    await expect(queue.getByText('Help queue student')).toBeVisible();
    await expect(queue.getByText(/Sum two numbers/)).toBeVisible();
    await queue.getByRole('button', { name: /Start helping|도움 시작/ }).click();
    await expect(queue.getByText(/Helping: Queue teacher|도움을 주는 선생님: Queue teacher/)).toBeVisible();
    await expect(edit).toHaveAttribute('aria-pressed', 'false');
    await teacher.setViewportSize({ width: 900, height: 800 });
    await expect(queue.getByRole('button', { name: /Return to queue|대기열로 돌려보내기/ })).toBeVisible();
    await teacher.screenshot({ path: testInfo.outputPath('help-queue.png') });
    await student.screenshot({ path: testInfo.outputPath('student-help-request.png') });
    await student.reload();
    await expect(control.getByText(/Queue teacher/)).toBeVisible();
    await queue.getByRole('button', { name: /Return to queue|대기열로 돌려보내기/ }).click();
    await expect(queue.getByRole('button', { name: /Start helping|도움 시작/ })).toBeVisible();
    await queue.getByRole('button', { name: /^Mark resolved$|도움 완료/ }).click();
    await expect(queue.getByText(/No help requests|도움 요청이 없습니다/)).toBeVisible();
    await expect(edit).toHaveAttribute('aria-pressed', 'false');
    await teacher.keyboard.press('Escape');
    await expect(teacher.getByRole('button', { name: /Help requests · 0 waiting|도움 요청 · 대기 0명/ })).toBeFocused();
    await student.reload();
    failNextCreate = true;
    await control.getByRole('button', { name: /^Request help$|도움 요청하기/ }).click();
    await expect(control.getByRole('button', { name: /Retry|다시 시도/ })).toBeVisible();
    await control.getByRole('button', { name: /Retry|다시 시도/ }).click();
    expect(createKeys.at(-1)).toBe(createKeys.at(-2));
    await control.getByRole('button', { name: /Cancel request|요청 취소/ }).click();
    await expect(control.getByRole('button', { name: /^Request help$|도움 요청하기/ })).toBeEnabled();
    expect(mutations).toContain('resolveHelpRequest');
    expect(mutations).toContain('cancelMyHelpRequest');
  } finally { for (const context of contexts) await context.close(); }
});
