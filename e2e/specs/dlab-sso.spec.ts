import { test, expect, webkit, type Page, type APIRequestContext } from '@playwright/test';
import { resolve } from 'node:path';
test.beforeEach(async ({ context }) => { await context.route('https://os.dlabcampus.com/**', route => route.abort()); });
const fixtureOrigin = 'http://127.0.0.1:4320';
type Fixture = { id: string; academy: { slug: string; id: string }; username?: string };
async function fixture(request: APIRequestContext, role: string, extra: object = {}): Promise<Fixture> {
  const response = await request.post(fixtureOrigin + '/fixtures', { data: { role, ...extra } });
  expect(response.ok()).toBeTruthy(); return response.json();
}
async function tokenFor(page: Page) {
  const parts = (await page.context().cookies()).filter(c => /auth-token(?:\.\d+)?$/.test(c.name)).sort((a, b) => a.name.localeCompare(b.name));
  const value = parts.map(c => c.value).join('');
  return JSON.parse(Buffer.from(value.replace(/^base64-/, ''), 'base64url').toString()).access_token as string;
}
async function rpc(page: Page, request: APIRequestContext, path: string, input: object) {
  return request.post('http://127.0.0.1:4319/api/rpc/' + path, { headers: { Authorization: 'Bearer ' + await tokenFor(page) }, data: { json: input } });
}
async function enter(page: Page, value: Fixture) {
  if (page.context().browser()?.browserType().name() === 'webkit') {
    // WebKit cannot fulfill intercepted redirects. The context's request client
    // shares cookies with its page, so Cove still creates and validates the real
    // HttpOnly state cookie before we visit the local authorization double.
    const response = await page.request.get('/sso/start', { maxRedirects: 0 });
    expect(response.status()).toBe(302);
    const target = new URL(response.headers().location!);
    expect(target.origin + target.pathname).toBe('https://os.dlabcampus.com/v1/sso/authorize');
    target.searchParams.set('fixture', value.id);
    await page.goto(fixtureOrigin + '/os/authorize?' + target.searchParams);
    return;
  }
  // Intercept the first navigation: Chromium routing does not reroute the
  // subsequent Location hop of an already-routed navigation. Fetch Cove's real
  // handler without following redirects, assert its production OS URL, and send
  // only this test browser to our local OS double, preserving Set-Cookie.
  await page.route('**/sso/start**', async route => {
    const response = await route.fetch({ maxRedirects: 0 });
    expect(response.status()).toBe(302);
    const target = new URL(response.headers().location!);
    expect(target.origin + target.pathname).toBe('https://os.dlabcampus.com/v1/sso/authorize');
    target.searchParams.set('fixture', value.id);
    await route.fulfill({ response, headers: { ...response.headers(), location: fixtureOrigin + '/os/authorize?' + target.searchParams } });
  });
  await page.goto('/sso/start');
}
for (const [osRole, role] of [['student', 'STUDENT'], ['instructor', 'TEAM_LEAD'], ['tutor', 'TEACHER'], ['so_staff', 'TEAM_LEAD'], ['edu_manager', 'TEAM_LEAD'], ['lab_head', 'MANAGER'], ['future_role', 'STUDENT']] as const) {
  test(`OS ${osRole} automatically enters Cove as ${role} and reuses the account`, async ({ page, request }) => {
    const value = await fixture(request, osRole);
    await enter(page, value);
    await expect(page).toHaveURL(new RegExp('/academy/' + value.academy.slug + '$'));
    if (role === 'STUDENT') await expect(page.getByRole('heading', { name: 'Hi, Browser ' + osRole, exact: true })).toBeVisible();
    else await expect(page.getByRole('heading', { name: role === 'TEACHER' ? 'Teaching overview' : role === 'MANAGER' ? 'Control tower' : 'What SSO Browser Academy teaches', level: 1, exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('dashboard.png'), animations: 'disabled', timeout: 15_000 });
    const first = await (await request.get(fixtureOrigin + '/fixtures/' + value.id, { maxRetries: 2 })).json();
    expect(first.studentLeaseCount).toBe(role === 'STUDENT' ? 1 : 0);
    expect(first.platformRole).toBe('USER'); expect(first.memberships).toHaveLength(1); expect(first.memberships[0].role).toBe(role);
    const expectedRoles = role === 'MANAGER' ? ['MANAGER', 'TEAM_LEAD', 'TEACHER'] : role === 'TEAM_LEAD' ? ['TEAM_LEAD', 'TEACHER'] : [role];
    expect(first.memberships[0].roles.sort()).toEqual(expectedRoles.sort());
    if (role === 'MANAGER' || role === 'TEAM_LEAD') await expect(page.getByRole('link', { name: 'My classes', exact: true })).toBeVisible();
    await page.reload(); await expect(page).toHaveURL(new RegExp('/academy/' + value.academy.slug + '$'));
    await page.goto('/sso/start'); await expect(page).toHaveURL(new RegExp('/academy/' + value.academy.slug + '$'));
    const again = await (await request.get(fixtureOrigin + '/fixtures/' + value.id, { maxRetries: 2 })).json();
    expect(again.userId).toBe(first.userId); expect(again.memberships[0].id).toBe(first.memberships[0].id);
    const denied = await rpc(page, request, 'platformAcademies/get', { academyId: value.academy.id });
    expect(denied.status()).toBe(403);
    const manage = await rpc(page, request, 'academyMembers/list', { academyId: value.academy.id });
    expect(manage.status()).toBe(role === 'MANAGER' ? 200 : 403);
    const unrelated = await fixture(request, 'student');
    expect((await rpc(page, request, 'academyMembers/list', { academyId: unrelated.academy.id })).status()).toBe(403);

  });
}
test('OS HQ admin enters the platform console without an academy membership and reuses its account', async ({ page, request }) => {
  const value = await fixture(request, 'hq_admin'); await enter(page, value);
  await expect(page).toHaveURL(/\/admin\/academies$/);
  await expect(page.getByRole('heading', { name: 'Academies', level: 1, exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('hq-admin-console.png'), animations: 'disabled', timeout: 15_000 });
  const saved = await (await request.get(fixtureOrigin + '/fixtures/' + value.id)).json();
  expect(saved.platformRole).toBe('ADMIN'); expect(saved.memberships).toHaveLength(0); expect(saved.studentLeaseCount).toBe(0);
  expect((await rpc(page, request, 'platformAcademies/get', { academyId: value.academy.id })).status()).toBe(200);
  await page.reload(); await expect(page).toHaveURL(/\/admin\/academies$/);
  await page.goto('/sso/start'); await expect(page).toHaveURL(/\/admin\/academies$/);
  const again = await (await request.get(fixtureOrigin + '/fixtures/' + value.id)).json(); expect(again.userId).toBe(saved.userId);
});
test('HQ admin demotion revokes console access and the fresh login receives only the source academy role', async ({ page, request }) => {
  const value = await fixture(request, 'hq_admin'); await enter(page, value); await expect(page).toHaveURL(/\/admin\/academies$/);
  const oldToken = await tokenFor(page);
  expect((await request.put(fixtureOrigin + '/fixtures/' + value.id, { data: { role: 'edu_manager' } })).ok()).toBe(true);
  expect((await request.post('http://127.0.0.1:4319/api/rpc/platformAcademies/get', { headers: { Authorization: 'Bearer ' + oldToken }, data: { json: { academyId: value.academy.id } } })).status()).toBe(401);
  await page.goto('/login'); await expect(page.getByRole('heading', { name: 'Log in', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Log in with DLAB', exact: true }).click();
  await expect(page).toHaveURL(new RegExp('/academy/' + value.academy.slug + '$'));
  const saved = await (await request.get(fixtureOrigin + '/fixtures/' + value.id)).json();
  expect(saved.platformRole).toBe('USER'); expect(saved.memberships[0].role).toBe('TEAM_LEAD');
  expect((await rpc(page, request, 'platformAcademies/get', { academyId: value.academy.id })).status()).toBe(403);
});
test('HQ admin deactivation revokes live platform access', async ({ page, request }) => {
  const value = await fixture(request, 'hq_admin'); await enter(page, value); await expect(page).toHaveURL(/\/admin\/academies$/);
  const token = await tokenFor(page);
  expect((await request.put(fixtureOrigin + '/fixtures/' + value.id, { data: { status: 'inactive' } })).ok()).toBe(true);
  const denied = await request.post('http://127.0.0.1:4319/api/rpc/platformAcademies/get', { headers: { Authorization: 'Bearer ' + token }, data: { json: { academyId: value.academy.id } } });
  expect(denied.status()).toBe(403);
  const saved = await (await request.get(fixtureOrigin + '/fixtures/' + value.id)).json(); expect(saved.platformRole).toBe('USER');
});
for (const osRole of ['instructor', 'hq_admin']) {
test(`an unapproved campus gives OS ${osRole} no Cove account or session`, async ({ page, request }) => {
  const value = await fixture(request, osRole, { enabled: false });
  await enter(page, value); await expect(page).toHaveURL(/\/sso\/error$/);
  const saved = await (await request.get(fixtureOrigin + '/fixtures/' + value.id, { maxRetries: 2 })).json();
  expect(saved.userId).toBeNull(); expect(saved.memberships).toHaveLength(0);
});
}
test('a forged callback is rejected without creating a session', async ({ page }) => {
  await page.goto('/sso/callback?code=forged&state=forged');
  await expect(page).toHaveURL(/\/sso\/error$/);
  expect((await page.context().cookies()).some(c => /auth-token/.test(c.name))).toBe(false);
});
for (const role of ['STUDENT', 'TEACHER', 'TEAM_LEAD', 'MANAGER', 'ADMIN']) {
  test(`legacy ${role} password login remains available`, async ({ page, request }) => {
    const value = await fixture(request, role, { legacy: true });
    await page.goto('/login');
    const password = page.getByLabel(/^(Password|비밀번호)$/i, { exact: true });
    // No external CAPTCHA in this isolated provider harness. Confirm hydration
    // through an actual client interaction before filling controlled inputs.
    await expect(async () => {
      if (await password.getAttribute('type') !== 'text') await page.getByRole('button', { name: 'Show password', exact: true }).click();
      await expect(password).toHaveAttribute('type', 'text');
    }).toPass({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Hide password', exact: true }).click();
    await page.getByRole('textbox', { name: /ID|아이디|username/i }).fill(value.username!);
    await page.getByLabel(/^(Password|비밀번호)$/i, { exact: true }).fill('LocalLegacyTest123!');
    await page.getByRole('button', { name: /^(Log in|로그인|Sign in)$/i }).click();
    await expect(page).toHaveURL(role === 'ADMIN' ? /\/admin(?:\/academies)?$/ : new RegExp('/academy/' + value.academy.slug + '$'));
  });
}

test('HQ deactivation blocks live tokens; reactivation requires a fresh SSO login', async ({ page, request }) => {
  const value = await fixture(request, 'instructor');
  await enter(page, value); await expect(page).toHaveURL(new RegExp('/academy/' + value.academy.slug + '$'));
  const oldToken = await tokenFor(page);
  const deactivate = await request.put(fixtureOrigin + '/fixtures/' + value.id, { data: { status: 'inactive' } });
  expect(deactivate.ok()).toBe(true);
  const me = () => request.post('http://127.0.0.1:4319/api/rpc/auth/me', { headers: { Authorization: 'Bearer ' + oldToken }, data: { json: {} } });
  expect((await me()).status()).toBe(403);
  expect((await request.put(fixtureOrigin + '/fixtures/' + value.id, { data: { status: 'active' } })).ok()).toBe(true);
  expect((await me()).status()).toBe(401);
  // Let the revoked protected layout unmount before starting another login.
  await page.goto('/login'); await expect(page.getByRole('heading', { name: 'Log in', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Log in with DLAB', exact: true }).click();
  await expect(page).toHaveURL(new RegExp('/academy/' + value.academy.slug + '$'));
  expect((await rpc(page, request, 'auth/me', {})).ok()).toBe(true);
});
test('HQ role changes revoke the old session and the next login receives the new role', async ({ page, request }) => {
  const value = await fixture(request, 'tutor');
  await enter(page, value); await expect(page).toHaveURL(new RegExp('/academy/' + value.academy.slug + '$'));
  const oldToken = await tokenFor(page);
  expect((await request.put(fixtureOrigin + '/fixtures/' + value.id, { data: { role: 'edu_manager' } })).ok()).toBe(true);
  expect((await request.post('http://127.0.0.1:4319/api/rpc/auth/me', { headers: { Authorization: 'Bearer ' + oldToken }, data: { json: {} } })).status()).toBe(401);
  // Let the revoked protected layout unmount before starting another login.
  await page.goto('/login'); await expect(page.getByRole('heading', { name: 'Log in', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Log in with DLAB', exact: true }).click();
  await expect(page).toHaveURL(new RegExp('/academy/' + value.academy.slug + '$'));
  const saved = await (await request.get(fixtureOrigin + '/fixtures/' + value.id, { maxRetries: 2 })).json();
  expect(saved.memberships[0].role).toBe('TEAM_LEAD'); expect(saved.studentLeaseCount).toBe(0);
});
test('Cove logout removes the browser session', async ({ page, request }) => {
  const value = await fixture(request, 'instructor');
  await enter(page, value); await expect(page).toHaveURL(new RegExp('/academy/' + value.academy.slug + '$'));
  await page.getByRole('button', { name: 'My page', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.context().cookies()).some(c => /auth-token/.test(c.name))).toBe(false);
});


async function manualRequest(page: Page, request: APIRequestContext, path: string, input: Record<string, unknown>, method: 'GET' | 'POST' = 'POST') {
  return request.fetch('http://127.0.0.1:4319/api/manual' + path, {
    method, headers: { Authorization: 'Bearer ' + await tokenFor(page) },
    ...(method === 'GET' ? { params: input as Record<string, string> } : { data: input }),
  });
}

async function visibleEditor(page: Page, code?: string) {
  return page.evaluate((next) => {
    const monaco = (window as unknown as { monaco?: { editor: { getEditors(): { getDomNode(): HTMLElement | null; getModel(): { setValue(code: string): void; getValue(): string } | null }[] } } }).monaco;
    const model = monaco?.editor.getEditors().find(editor => editor.getDomNode()?.getClientRects().length)?.getModel();
    if (!model) return null;
    if (next !== undefined) model.setValue(next);
    return model.getValue();
  }, code);
}

for (const staffRole of ['lab_head', 'edu_manager'] as const) {
test(`OS ${staffRole} covers academy classes without teaching assignments`, async ({ page, request, browser }) => {
  test.setTimeout(180_000);
  const manager = await fixture(request, staffRole); await enter(page, manager);
  const student = await fixture(request, 'student', { parentFixtureId: manager.id });
  const leader = await fixture(request, 'edu_manager', { parentFixtureId: manager.id });
  const studentContext = await browser.newContext(); const studentPage = await studentContext.newPage();
  const leaderContext = await browser.newContext(); const leaderPage = await leaderContext.newPage();
  try {
    await enter(studentPage, student); await expect(studentPage).toHaveURL(new RegExp('/academy/' + manager.academy.slug + '$'));
    await enter(leaderPage, leader); await expect(leaderPage).toHaveURL(new RegExp('/academy/' + manager.academy.slug + '$'));
    const seeded = await request.post(fixtureOrigin + '/fixtures/' + manager.id + '/classroom', { data: { studentFixtureId: student.id } });
    expect(seeded.ok(), await seeded.text()).toBe(true);
    const classroom = await seeded.json();
    const [assigned, other] = classroom.classes;
    const membership = (await (await request.get(fixtureOrigin + '/fixtures/' + manager.id)).json()).memberships[0];
    const base = { academyId: manager.academy.id, classId: assigned.id };
    const roster = () => rpc(page, request, 'monitoring/getClassRoster', base);
    await page.goto('/academy/' + manager.academy.slug + '/teach/classes');
    await expect(page.getByRole('heading', { name: 'Assigned Python class', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Other Python class', exact: true })).toBeVisible();
    expect((await roster()).ok()).toBe(true);
    const submission = await manualRequest(studentPage, request, '/submit', { ...base, materialId: classroom.writtenMaterialId, files: {}, answer: 'I read two integers and add them with the plus operator.', revision: 0, contentRevision: 1, requestKey: crypto.randomUUID() });
    expect(submission.ok(), await submission.text()).toBe(true);
    const review = { academyId: manager.academy.id, materialId: classroom.writtenMaterialId, submissionId: (await submission.json()).submissionId, expectedVersion: 0, scoreHundredths: 9000, completed: true, feedback: 'Clear explanation of addition.' };
    expect((await rpc(leaderPage, request, 'monitoring/getClassRoster', base)).ok()).toBe(true);
    const picker = await rpc(leaderPage, request, 'academyClasses/listEligibleTeachers', base);
    expect(picker.ok()).toBe(true);
    expect((await picker.json()).json.teachers.some((entry: { membershipId: string }) => entry.membershipId === membership.id)).toBe(true);
    let detail = { updatedAt: assigned.updatedAt }; // No teaching assignment grants Manager access.
    expect((await roster()).ok()).toBe(true);
    const graded = await manualRequest(page, request, '/review', review);
    expect(graded.ok(), await graded.text()).toBe(true);
    const studentResult = await manualRequest(studentPage, request, '', { ...base, materialId: classroom.writtenMaterialId }, 'GET');
    expect(studentResult.ok(), await studentResult.text()).toBe(true);
    expect(await studentResult.text()).toContain('Clear explanation of addition.');
    expect((await rpc(page, request, 'monitoring/getClassRoster', { ...base, classId: other.id })).ok()).toBe(true);
    expect((await rpc(leaderPage, request, 'monitoring/getClassRoster', base)).ok()).toBe(true);
    // A stale role-mode cookie cannot hide Manager identity or inherited actions.
    await page.context().addCookies([{ name: 'cove_academy_role', value: manager.academy.id + ':TEACHER', url: 'http://127.0.0.1:3309' }]);
    await page.goto('/academy/' + manager.academy.slug);
    if (staffRole === 'lab_head') await expect(page.getByRole('heading', { name: 'Control tower', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'My classes', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'My page', exact: true }).click();
    await expect(page.getByRole('menuitemradio')).toHaveCount(0);
    await page.keyboard.press('Escape');
    const workspace = '/academy/' + manager.academy.slug + '/learn/exercises/' + classroom.materialId;
    await page.goto(workspace);
    await expect(page.getByRole('button', { name: 'View solution', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tutoring', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Edit', exact: true })).toBeVisible();
    await studentPage.goto(workspace + '?classId=' + assigned.id);
    await expect(studentPage.getByRole('button', { name: 'Run', exact: true })).toBeVisible();
    // Rendering Run precedes the student's realtime handshake. Establish
    // live presence before asking to edit; an offline saved-code view is valid.
    await page.goto('/academy/' + manager.academy.slug + '/teach/classes');
    await expect(page.getByText('1 solving', { exact: true })).toBeVisible();
    await page.goto(workspace);
    await page.getByRole('button', { name: 'Tutoring', exact: true }).click();
    const tutoringClass = page.getByRole('region', { name: 'Assigned Python class', exact: true });
    await expect(tutoringClass.getByText('Browser student', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Other Python class', exact: true })).toBeVisible();
    await tutoringClass.getByText('Browser student', { exact: true }).click();
    await expect(page.getByRole('button', { name: 'Return to my code', exact: true }).first()).toBeVisible();
    const editMode = page.getByRole('button', { name: 'Edit code · Off', exact: true });
    await expect(editMode).toBeEnabled({ timeout: 30_000 });
    await expect(editMode).toHaveAttribute('aria-pressed', 'false');
    await editMode.click();
    await expect(page.getByRole('button', { name: 'Edit code · On', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => visibleEditor(page, 'print(40 + 2)')).toBe('print(40 + 2)');
    await expect.poll(() => visibleEditor(studentPage), { timeout: 30_000 }).toBe('print(40 + 2)');
    const run = page.getByRole('button', { name: 'Run', exact: true });
    await expect(run).toBeEnabled({ timeout: 60_000 });
    await run.click();
    await expect(page.getByText('42', { exact: true })).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: test.info().outputPath('manager-unified-tutoring.png'), animations: 'disabled', timeout: 15_000 });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Code', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Edit code · On', exact: true })).toBeVisible();
    expect(await page.getByRole('paragraph').filter({ hasText: /^Browser student$/ }).evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('manager-unified-tutoring-mobile.png'), animations: 'disabled', timeout: 15_000 });
    await page.setViewportSize({ width: 1280, height: 720 });
    const contextInput = { ...base, membershipId: classroom.studentMembershipId, materialId: classroom.materialId, includeDraftCode: true };
    expect((await rpc(page, request, 'monitoring/getStudentContext', contextInput)).ok()).toBe(true);
    const removal = await rpc(leaderPage, request, 'academyClasses/setTeacher', { ...base, teacherMembershipId: null, expectedUpdatedAt: detail.updatedAt });
    expect(removal.ok()).toBe(true); detail = (await removal.json()).json;
    expect((await roster()).ok()).toBe(true);
    expect((await rpc(page, request, 'monitoring/getStudentContext', contextInput)).ok()).toBe(true);
    expect((await manualRequest(page, request, '/review', { ...review, expectedVersion: 1 })).ok()).toBe(true);
    // Manager self-assignment is a class operation, not a managed-role edit.
    const self = await rpc(page, request, 'academyClasses/setTeacher', { ...base, teacherMembershipId: membership.id, expectedUpdatedAt: detail.updatedAt });
    expect(self.ok()).toBe(true);
    expect((await roster()).ok()).toBe(true);
    const studentAssignment = await rpc(studentPage, request, 'academyClasses/setTeacher', { ...base, teacherMembershipId: membership.id, expectedUpdatedAt: (await self.json()).json.updatedAt });
    expect(studentAssignment.status()).toBe(403);
  } finally { await studentContext.close(); await leaderContext.close(); }
});

}

for (const osRole of ['tutor', 'edu_manager', 'lab_head'] as const) {
  test(`OS ${osRole} tutors short answers and quizzes with held-role authoring`, async ({ page, request, browser }) => {
    test.setTimeout(180_000);
    const manager = await fixture(request, 'lab_head');
    await enter(page, manager);
    await expect(page).toHaveURL(new RegExp('/academy/' + manager.academy.slug + '$'));
    const member = osRole === 'lab_head' ? manager : await fixture(request, osRole, { parentFixtureId: manager.id });
    const student = await fixture(request, 'student', { parentFixtureId: manager.id });
    const staffContext = await browser.newContext(), studentContext = await browser.newContext();
    const staffPage = await staffContext.newPage(), studentPage = await studentContext.newPage();
    try {
      await enter(staffPage, member); await expect(staffPage).toHaveURL(new RegExp('/academy/' + manager.academy.slug + '$'));
      await enter(studentPage, student); await expect(studentPage).toHaveURL(new RegExp('/academy/' + manager.academy.slug + '$'));
      const seeded = await request.post(fixtureOrigin + '/fixtures/' + manager.id + '/classroom', { data: { studentFixtureId: student.id } });
      expect(seeded.ok(), await seeded.text()).toBe(true);
      const classroom = await seeded.json(), [assigned, other] = classroom.classes;
      const base = { academyId: manager.academy.id, classId: assigned.id };
      const staffMembership = (await (await request.get(fixtureOrigin + '/fixtures/' + member.id)).json()).memberships[0];
      const unassigned = await manualRequest(staffPage, request, '', { academyId: base.academyId, materialId: classroom.shortMaterialId }, 'GET');
      if (osRole === 'tutor') expect(unassigned.status()).toBe(404);
      else expect((await unassigned.json()).staff.classes).toHaveLength(2);
      const assignment = await rpc(page, request, 'academyClasses/setTeacher', { ...base, teacherMembershipId: staffMembership.id, expectedUpdatedAt: assigned.updatedAt });
      expect(assignment.ok(), await assignment.text()).toBe(true);
      const assignedDetail = (await assignment.json()).json;
      for (const [kind, materialId] of [['short', classroom.shortMaterialId], ['quiz', classroom.quizMaterialId]] as const) {
        const activity = '/academy/' + manager.academy.slug + '/learn/' + (kind === 'quiz' ? 'quizzes/' : 'turtle/') + materialId;
        await studentPage.goto(activity + '?classId=' + assigned.id);
        await expect(studentPage.getByRole('button', { name: 'Tutoring', exact: true })).toHaveCount(0);
        await expect(studentPage.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
        await expect(studentPage.getByRole('button', { name: 'View solution', exact: true })).toHaveCount(0);
        const studentRead = await manualRequest(studentPage, request, '', { ...base, materialId }, 'GET');
        const publicData = await studentRead.json();
        expect(publicData.staff).toBeUndefined();
        expect(publicData.config.shortAnswer?.expectedAnswer ?? '').toBe('');
        expect(publicData.config.multipleChoice?.correctOptionIds).toBeUndefined();
        expect((await manualRequest(studentPage, request, '', { ...base, materialId, preview: true }, 'GET')).status()).toBe(403);
        if (kind === 'short') await studentPage.getByRole('textbox', { name: 'Your answer', exact: true }).fill('Python');
        else await studentPage.getByRole('radio', { name: 'Option 1: +', exact: true }).check();
        await studentPage.getByRole('button', { name: 'Submit', exact: true }).click();
        await expect(studentPage.getByText('100 / 100', { exact: false }).first()).toBeVisible({ timeout: 30_000 });

        await staffPage.goto(activity);
        await expect(staffPage.getByRole('button', { name: 'View solution', exact: true })).toBeVisible();
        await expect(staffPage.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(osRole === 'tutor' ? 0 : 1);
        await staffPage.getByRole('button', { name: 'View solution', exact: true }).click();
        const solution = staffPage.getByRole('dialog', { name: 'View solution', exact: true });
        await expect(solution.getByText(kind === 'short' ? 'Python' : '+', { exact: true })).toBeVisible();
        await solution.getByRole('button', { name: 'Close panel', exact: true }).click();
        const privateRead = await manualRequest(staffPage, request, '', { ...base, materialId, preview: true }, 'GET');
        const privateData = await privateRead.json();
        const authorInput = { ...privateData.config, academyId: base.academyId, courseId: classroom.courseId, lectureId: classroom.lectureId, materialId, title: privateData.title, type: privateData.type };
        expect((await manualRequest(studentPage, request, '', authorInput)).status()).toBe(403);
        if (osRole === 'tutor') expect((await manualRequest(staffPage, request, '', authorInput)).status()).toBe(403);
        if (osRole !== 'tutor') {
          await staffPage.getByRole('button', { name: 'Edit', exact: true }).click();
          const editor = staffPage.getByRole('dialog', { name: 'Edit activity', exact: true });
          await expect(editor).toBeVisible();
          await expect(editor.getByRole('button', { name: 'Save activity', exact: true })).toBeEnabled();
          if (kind === 'short') {
            const hint = editor.getByLabel('Input hint', { exact: true });
            await hint.fill('Use the language name.');
            // The workspace polls every three seconds; it must not reset the open editor.
            await staffPage.waitForResponse(response => new URL(response.url()).pathname === '/api/manual' && new URL(response.url()).searchParams.get('preview') === 'false', { timeout: 10_000 });
            await expect(hint).toHaveValue('Use the language name.');
          }
          await editor.getByRole('button', { name: 'Save activity', exact: true }).click();
          await expect(editor).toHaveCount(0);
          // Load the new revision before returning to personal practice.
          await staffPage.reload();
          await expect(staffPage.getByRole('button', { name: 'Tutoring', exact: true })).toBeVisible();
        }
        if (osRole === 'lab_head') await staffPage.screenshot({ path: test.info().outputPath(kind + '-staff-actions.png'), animations: 'disabled', timeout: 15_000 });
        await staffPage.getByRole('button', { name: 'Tutoring', exact: true }).click();
        const tutoring = staffPage.getByRole('dialog', { name: 'Tutoring', exact: true });
        await expect(tutoring.getByRole('link', { name: 'Other Python class', exact: true })).toHaveCount(osRole === 'tutor' ? 0 : 1);
        await tutoring.getByRole('link', { name: 'Assigned Python class', exact: true }).click();
        await expect(staffPage.getByRole('heading', { name: 'Grade and feedback', exact: true })).toBeVisible();
        await expect(staffPage.getByRole('button', { name: 'Tutoring', exact: true })).toHaveAttribute('aria-pressed', 'true');
        await expect(staffPage.getByRole('link', { name: 'Return to my answer', exact: true })).toBeVisible();
        const feedback = `Helpful ${kind} feedback from ${osRole}.`;
        await staffPage.getByRole('spinbutton', { name: 'Score', exact: true }).fill('90');
        await staffPage.getByRole('textbox', { name: 'Feedback', exact: true }).fill(feedback);
        await staffPage.getByRole('button', { name: 'Publish review', exact: true }).click();
        await expect(staffPage.getByText('Review published to the learner', { exact: true })).toBeVisible();
        await studentPage.reload();
        await expect(studentPage.getByText(feedback, { exact: true }).first()).toBeVisible();
        const unchanged = await manualRequest(studentPage, request, '', { ...base, materialId }, 'GET');
        const history = (await unchanged.json()).attempts;
        expect(history).toHaveLength(1);
        if (kind === 'short') expect(history[0].answer).toBe('Python');
        else expect(history[0].multipleChoiceAssessment.selectedOptionIds).toEqual([privateData.config.multipleChoice.correctOptionIds[0]]);
        if (osRole === 'lab_head') {
          await staffPage.screenshot({ path: test.info().outputPath(kind + '-tutoring.png'), fullPage: true, animations: 'disabled', timeout: 15_000 });
          await staffPage.setViewportSize({ width: 390, height: 844 });
          expect(await staffPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
          await staffPage.screenshot({ path: test.info().outputPath(kind + '-tutoring-mobile.png'), fullPage: true, animations: 'disabled', timeout: 15_000 });
          await staffPage.setViewportSize({ width: 1280, height: 720 });
        }
        expect((await manualRequest(staffPage, request, '/roster', { ...base, classId: other.id, materialId }, 'GET')).status()).toBe(osRole === 'tutor' ? 404 : 200);
        expect((await manualRequest(studentPage, request, '/roster', { ...base, materialId }, 'GET')).status()).toBe(403);
      }
      const removed = await rpc(page, request, 'academyClasses/setTeacher', { ...base, teacherMembershipId: null, expectedUpdatedAt: assignedDetail.updatedAt });
      expect(removed.ok()).toBe(true);
      expect((await manualRequest(staffPage, request, '/roster', { ...base, materialId: classroom.quizMaterialId }, 'GET')).status()).toBe(osRole === 'tutor' ? 404 : 200);
      const refreshed = await manualRequest(staffPage, request, '', { ...base, materialId: classroom.quizMaterialId }, 'GET');
      if (osRole === 'tutor') expect(refreshed.status()).toBe(404);
      else expect((await refreshed.json()).staff.classes).toHaveLength(2);
    } finally { await staffContext.close(); await studentContext.close(); }
  });
}

test('Manager class cards receive student presence over WebSocket across coding, short answers and quizzes', async ({ page, request, browser }) => {
  test.setTimeout(180_000);
  const manager = await fixture(request, 'lab_head');
  await enter(page, manager);
  await expect(page).toHaveURL(new RegExp('/academy/' + manager.academy.slug + '$'));
  const student = await fixture(request, 'student', { parentFixtureId: manager.id });
  const studentContext = await browser.newContext();
  const studentPage = await studentContext.newPage();
  const studentSockets: string[] = [], managerSockets: string[] = [];
  studentPage.on('websocket', socket => studentSockets.push(socket.url()));
  page.on('websocket', socket => managerSockets.push(socket.url()));
  try {
    await enter(studentPage, student);
    await expect(studentPage).toHaveURL(new RegExp('/academy/' + manager.academy.slug + '$'));
    const seeded = await request.post(fixtureOrigin + '/fixtures/' + manager.id + '/classroom', { data: { studentFixtureId: student.id } });
    expect(seeded.ok(), await seeded.text()).toBe(true);
    const classroom = await seeded.json(), [assigned] = classroom.classes;
    const base = { academyId: manager.academy.id, classId: assigned.id };
    const root = '/academy/' + manager.academy.slug;
    await page.goto(root + '/teach/classes');
    const card = page.getByRole('link').filter({ has: page.getByRole('heading', { name: 'Assigned Python class', exact: true }) });
    await expect(card.getByText('1 online', { exact: true })).toBeVisible();
    await expect(card.getByText('0 solving', { exact: true })).toBeVisible();
    for (const [path, id] of [['exercises', classroom.materialId], ['turtle', classroom.shortMaterialId], ['quizzes', classroom.quizMaterialId]] as const) {
      await studentPage.goto(root + '/learn/' + path + '/' + id + '?classId=' + assigned.id);
      await expect(card.getByText('1 solving', { exact: true })).toBeVisible();
      const roster = await rpc(page, request, 'monitoring/getClassRoster', base);
      expect(roster.ok()).toBe(true);
      // The class card must be updated by pushed snapshots/deltas, not an HTTP polling loop.
      expect(studentSockets.some(url => url.includes('transport=websocket'))).toBe(true);
      expect(managerSockets.some(url => url.includes('transport=websocket'))).toBe(true);
      await studentPage.goto(root + '/learn/courses/' + classroom.courseId + '?classId=' + assigned.id);
      await expect(card.getByText('0 solving', { exact: true })).toBeVisible();
      await expect(card.getByText('1 online', { exact: true })).toBeVisible();
    }
    await studentPage.goto(root + '/learn/quizzes/' + classroom.quizMaterialId + '?classId=' + assigned.id);
    await studentPage.reload();
    await expect(card.getByText('1 solving', { exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('manager-live-class-counts.png'), animations: 'disabled', timeout: 15_000 });
    await studentContext.close();
    await expect(card.getByText('0 online', { exact: true })).toBeVisible({ timeout: 45_000 });
    await expect(card.getByText('0 solving', { exact: true })).toBeVisible();
  } finally { await studentContext.close(); }
});

for (const engine of ['Chromium', 'WebKit'] as const) {
  test(`${engine} learning UI identifies materials, opens PDF rows and keeps student and monitor statements consistent`, async ({ browser, request }) => {
    test.setTimeout(180_000);
    const ownedBrowser = engine === 'WebKit' ? await webkit.launch() : null;
    const current = ownedBrowser ?? browser;
    const staffContext = await current.newContext({ baseURL: 'http://127.0.0.1:3309' });
    const studentContext = await current.newContext({ baseURL: 'http://127.0.0.1:3309' });
    for (const context of [staffContext, studentContext]) {
      await context.route('https://os.dlabcampus.com/**', route => route.abort());
      await context.route('https://dlab-sso-provider.invalid/storage/**', route => route.fulfill({
        path: resolve('e2e/fixtures/lecture-material.pdf'), contentType: 'application/pdf',
        headers: { 'access-control-allow-origin': '*' },
      }));
    }
    const staff = await staffContext.newPage(), learner = await studentContext.newPage();
    try {
      const staffRole = engine === 'WebKit' ? 'edu_manager' : 'lab_head';
      const manager = await fixture(request, staffRole);
      await enter(staff, manager);
      await expect(staff).toHaveURL(new RegExp('/academy/' + manager.academy.slug + '$'));
      const student = await fixture(request, 'student', { parentFixtureId: manager.id });
      await enter(learner, student);
      await expect(learner).toHaveURL(new RegExp('/academy/' + manager.academy.slug + '$'));
      const seeded = await request.post(fixtureOrigin + '/fixtures/' + manager.id + '/classroom', { data: { studentFixtureId: student.id, includePdf: true } });
      expect(seeded.ok(), await seeded.text()).toBe(true);
      const classroom = await seeded.json(), [assigned] = classroom.classes;
      const membership = (await (await request.get(fixtureOrigin + '/fixtures/' + manager.id)).json()).memberships[0];
      expect((await rpc(staff, request, 'academyClasses/setTeacher', { academyId: manager.academy.id, classId: assigned.id, teacherMembershipId: membership.id, expectedUpdatedAt: assigned.updatedAt })).ok()).toBe(true);
      const root = '/academy/' + manager.academy.slug;
      await learner.goto(root + '/learn/classes');
      const card = learner.getByRole('link').filter({ has: learner.getByRole('heading', { name: 'Assigned Python class', exact: true }) });
      await expect(card.getByText('Browser ' + staffRole, { exact: true })).toBeVisible();
      await expect(card.getByText('1 student', { exact: true })).toBeVisible();
      await expect(learner.getByText(/Development demo:/)).toHaveCount(0);
      await learner.goto(root + '/learn/courses/' + classroom.courseId + '?classId=' + assigned.id);
      await learner.getByRole('button', { name: 'Expand or collapse Addition lesson', exact: true }).click();
      for (const label of ['Coding exercise', 'Written response', 'Multiple-choice quiz', 'PDF document']) await expect(learner.getByText(label, { exact: true }).first()).toBeVisible();
      await learner.screenshot({ path: test.info().outputPath(engine + '-material-list.png'), fullPage: true });
      await learner.getByRole('link').filter({ hasText: 'Add two numbers' }).click();
      await expect(learner.getByRole('heading', { name: 'Add two numbers', exact: true })).toBeVisible();
      const studentStatement = learner.getByTestId('problem-statement');
      await expect(studentStatement.frameLocator('iframe').getByText('Read two numbers and print their sum.', { exact: true })).toBeVisible();
      await expect.poll(() => studentStatement.locator('iframe').evaluate(frame => frame.getBoundingClientRect().height)).toBeLessThan(160);
      for (const text of ['Two integers separated by a space.', 'One integer: their sum.', 'Each integer is between 0 and 100.']) await expect(studentStatement.getByText(text, { exact: true })).toBeVisible();
      await staff.goto(root + '/teach/classes');
      await expect(staff.getByText('1 solving', { exact: true })).toBeVisible();
      await staff.goto(root + '/teach/classes/' + assigned.id + '/students/' + classroom.studentMembershipId + '/live');
      const monitorStatement = staff.getByTestId('problem-statement');
      await expect(monitorStatement.frameLocator('iframe').getByText('Read two numbers and print their sum.', { exact: true })).toBeVisible();
      for (const text of ['Two integers separated by a space.', 'One integer: their sum.', 'Each integer is between 0 and 100.']) await expect(monitorStatement.getByText(text, { exact: true })).toBeVisible();
      await expect.poll(() => monitorStatement.locator('iframe').evaluate(frame => frame.getBoundingClientRect().height)).toBeLessThan(160);
      const monitorPdf = staff.getByRole('complementary', { name: 'Course', exact: true }).getByRole('link').filter({ hasText: 'Lesson reference PDF' });
      await expect(monitorPdf).toHaveAttribute('target', '_blank');
      const note = staff.getByPlaceholder('Write one short note for this student on this exercise');
      await note.fill('Keep this feedback while reading the lesson.');
      const [resource] = await Promise.all([staffContext.waitForEvent('page'), monitorPdf.click()]);
      await expect(resource).toHaveURL(new RegExp('/learn/documents/' + classroom.pdfMaterialId));
      await expect(resource.locator('.react-pdf__Page__canvas')).toBeVisible({ timeout: 30_000 });
      await expect(resource.getByRole('complementary', { name: 'Course', exact: true })).toBeVisible();
      await resource.getByRole('button', { name: 'Tutoring', exact: true }).click();
      await expect(resource.getByRole('dialog').getByRole('link', { name: 'Assigned Python class', exact: true })).toBeVisible();
      await expect(resource.getByRole('dialog').getByRole('link', { name: 'Other Python class', exact: true })).toBeVisible();
      await resource.getByRole('button', { name: 'Close panel', exact: true }).click();
      await resource.getByRole('button', { name: 'Edit', exact: true }).click();
      await expect(resource.getByRole('dialog', { name: 'PDF material', exact: true })).toBeVisible();
      await resource.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).filter({ hasText: 'Cancel' }).click();
      await resource.screenshot({ path: test.info().outputPath(engine + '-unified-staff-pdf.png') });
      await resource.getByRole('complementary', { name: 'Course', exact: true }).getByRole('button').filter({ hasText: 'Explain your addition' }).click();
      await expect(resource.getByRole('heading', { name: 'Explain your addition', exact: true })).toBeVisible();
      await expect(resource.getByRole('button', { name: 'Tutoring', exact: true })).toBeVisible();
      await expect(resource.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
      await resource.screenshot({ path: test.info().outputPath(engine + '-unified-staff-written.png') });
      await resource.close();
      await expect(note).toHaveValue('Keep this feedback while reading the lesson.');
      await staff.screenshot({ path: test.info().outputPath(engine + '-monitor-statement.png') });
      const tree = learner.getByRole('complementary', { name: 'Course', exact: true });
      await expect(tree.getByRole('button').filter({ hasText: 'Lesson reference PDF' })).toBeVisible();
      await tree.getByRole('button').filter({ hasText: 'Lesson reference PDF' }).click();
      await expect(learner).toHaveURL(new RegExp('/learn/documents/' + classroom.pdfMaterialId));
      await expect(learner.locator('.react-pdf__Page__canvas')).toBeVisible({ timeout: 30_000 });
      await learner.screenshot({ path: test.info().outputPath(engine + '-pdf-navigation.png') });
      await learner.getByRole('complementary', { name: 'Course', exact: true }).getByRole('button').filter({ hasText: 'Choose the operator' }).click();
      await expect(learner).toHaveURL(new RegExp('/learn/quizzes/' + classroom.quizMaterialId));
      await expect(learner.getByRole('radio', { name: 'Option 1: +', exact: true })).toBeVisible();
      await expect(learner.getByRole('button', { name: 'Tutoring', exact: true })).toHaveCount(0);
      await expect(learner.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
      await expect(learner.locator('footer').getByText('Previous', { exact: true })).toBeVisible();
      await expect(learner.locator('footer').getByText('Next', { exact: true })).toBeVisible();
      await learner.getByRole('radio', { name: 'Option 1: +', exact: true }).check();
      learner.once('dialog', dialog => dialog.dismiss());
      await learner.getByRole('complementary', { name: 'Course', exact: true }).getByRole('button').filter({ hasText: 'Lesson reference PDF' }).click();
      await expect(learner).toHaveURL(new RegExp('/learn/quizzes/' + classroom.quizMaterialId));
      await expect(learner.getByRole('radio', { name: 'Option 1: +', exact: true })).toBeChecked();
      learner.once('dialog', dialog => dialog.accept());
      await learner.getByRole('complementary', { name: 'Course', exact: true }).getByRole('button').filter({ hasText: 'Lesson video' }).click();
      await expect(learner).toHaveURL(new RegExp('/learn/videos/' + classroom.videoMaterialId));
      await expect(learner.getByRole('heading', { name: 'Lesson video', exact: true })).toBeVisible();
      await expect(learner.getByRole('complementary', { name: 'Course', exact: true })).toBeVisible();
      await learner.locator('footer').getByText('Previous', { exact: true }).click();
      await expect(learner).toHaveURL(new RegExp('/learn/quizzes/' + classroom.quizMaterialId));
      await learner.locator('footer').getByText('Previous', { exact: true }).click();
      await expect(learner).toHaveURL(new RegExp('/learn/turtle/' + classroom.shortMaterialId));
      await learner.locator('footer').getByText('Next', { exact: true }).click();
      await expect(learner).toHaveURL(new RegExp('/learn/quizzes/' + classroom.quizMaterialId));
      await learner.screenshot({ path: test.info().outputPath(engine + '-unified-student-quiz.png') });
      await learner.setViewportSize({ width: 390, height: 844 });
      expect(await learner.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    } finally {
      await staffContext.close(); await studentContext.close(); await ownedBrowser?.close();
    }
  });
}
