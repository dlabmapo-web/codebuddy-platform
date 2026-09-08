import { expect, type Page } from '@playwright/test';

/** Archive only IDs created by the calling suite, including after a failure. */
export async function archiveTestClasses(page: Page, classIds: string[]) {
  const ids = classIds.filter(Boolean);
  if (ids.length === 0) return;
  const chunks = (await page.context().cookies())
    .filter((cookie) => /^sb-.+-auth-token(\.\d+)?$/.test(cookie.name))
    .sort((a, b) => {
      const index = (name: string) => Number(/\.(\d+)$/.exec(name)?.[1] ?? 0);
      return index(a.name) - index(b.name);
    });
  let raw = decodeURIComponent(chunks.map((cookie) => cookie.value).join(''));
  if (raw.startsWith('base64-')) raw = Buffer.from(raw.slice(7), 'base64').toString('utf8');
  const { access_token: token } = JSON.parse(raw) as { access_token: string };
  expect(token).toBeTruthy();
  const apiUrl = process.env.E2E_API_URL ?? 'http://localhost:4000/api/rpc';
  const headers = { Authorization: `Bearer ${token}` };
  const accountResponse = await page.request.post(`${apiUrl}/auth/me`, {
    headers, data: { json: {} },
  });
  expect(accountResponse.ok()).toBeTruthy();
  const account = await accountResponse.json();
  const academyId = account.json.user.memberships.find(
    (membership: { academy: { slug: string } }) =>
      membership.academy.slug === 'development-academy',
  )?.academy.id;
  expect(academyId).toBeTruthy();
  for (const classId of ids) {
    const response = await page.request.post(`${apiUrl}/academyClasses/setStatus`, {
      headers, data: { json: { academyId, classId, status: 'ARCHIVED' } },
    });
    expect(response.ok(), `Archive test class ${classId}: HTTP ${response.status()}`).toBeTruthy();
  }
}
