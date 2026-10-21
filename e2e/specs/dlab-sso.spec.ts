import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
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
for (const [osRole, role] of [['student', 'STUDENT'], ['instructor', 'TEACHER'], ['edu_manager', 'TEAM_LEAD'], ['lab_head', 'MANAGER'], ['future_role', 'STUDENT']] as const) {
  test(`OS ${osRole} automatically enters Cove as ${role} and reuses the account`, async ({ page, request }) => {
    const value = await fixture(request, osRole);
    await enter(page, value);
    await expect(page).toHaveURL(new RegExp('/academy/' + value.academy.slug + '$'));
    if (role === 'STUDENT') await expect(page.getByRole('heading', { name: 'Hi, Browser ' + osRole, exact: true })).toBeVisible();
    else await expect(page.getByRole('heading', { name: role === 'TEACHER' ? 'Teaching overview' : role === 'MANAGER' ? 'Control tower' : 'What SSO Browser Academy teaches', level: 1, exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('dashboard.png') });
    const first = await (await request.get(fixtureOrigin + '/fixtures/' + value.id, { maxRetries: 2 })).json();
    expect(first.studentLeaseCount).toBe(role === 'STUDENT' ? 1 : 0);
    expect(first.platformRole).toBe('USER'); expect(first.memberships).toHaveLength(1); expect(first.memberships[0].role).toBe(role);
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
test('an unapproved campus receives no Cove account or session', async ({ page, request }) => {
  const value = await fixture(request, 'instructor', { enabled: false });
  await enter(page, value); await expect(page).toHaveURL(/\/sso\/error$/);
  const saved = await (await request.get(fixtureOrigin + '/fixtures/' + value.id, { maxRetries: 2 })).json();
  expect(saved.userId).toBeNull(); expect(saved.memberships).toHaveLength(0);
});
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
  const value = await fixture(request, 'instructor');
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
