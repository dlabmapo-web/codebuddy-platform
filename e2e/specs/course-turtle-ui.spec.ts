import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { signInAs } from '../support/auth';

const demo = process.env.E2E_TURTLE_UI_DEMO ? JSON.parse(readFileSync(process.env.E2E_TURTLE_UI_DEMO, 'utf8')) as { academyId: string; materials: Array<{ id: string }> } : undefined;
const api = process.env.E2E_TURTLE_API ?? 'http://localhost:4000/api/manual';
test.skip(!demo, 'Requires the user-requested local Turtle demo course');

async function painted(page: Page) {
  await expect.poll(() => page.getByTestId('turtle-display').locator('canvas').evaluate(node => {
    const c = node as HTMLCanvasElement;
    if (!c.width || !c.height) return 0;
    const pixels = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let blue = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 2] > 140 && pixels[i] < 100 && pixels[i + 1] < 100) blue++;
    return blue;
  }), { timeout: 45000 }).toBeGreaterThan(50);
}

test('course Turtle UI: centered file-aware solution, compact icons, stable drawing layouts and resize', async ({ page, browser }, info) => {
  test.setTimeout(360000);
  const materialId = demo!.materials[0].id;
  const path = `/academy/development-academy/learn/turtle/${materialId}?preview=true`;
  const sessions: string[] = [], sockets: string[] = [], errors: string[] = [];
  let authorization = '';
  page.on('request', request => { if (request.headers().authorization?.startsWith('Bearer ')) authorization = request.headers().authorization; });
  page.on('websocket', socket => { if (socket.url().includes('/display')) sockets.push(socket.url()); });
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.url() === api + '/sessions' && response.request().method() === 'POST' && response.ok()) void response.json().then(body => sessions.push(body.id));
  });
  try {
    await signInAs({ page, identifier: 'teamlead@cove.test', password: 'CoveDev123!', initialPath: path });
    await expect(page.getByRole('button', { name: 'View solution', exact: true })).toBeVisible({ timeout: 60000 });
    await expect(page.getByRole('button', { name: 'Drawing layout', exact: true })).toBeVisible();
    await expect(page.locator('input[type=range]')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => {
      const monaco = (window as unknown as { monaco?: { editor: { getModels(): Array<{ getValue(): string }> } } }).monaco;
      return monaco?.editor.getModels()[0]?.getValue() ?? '';
    })).toContain('t.forward(120)');
    const sourceBefore = await page.evaluate(() => (window as unknown as { monaco: { editor: { getModels(): Array<{ getValue(): string }> } } }).monaco.editor.getModels()[0].getValue());
    await page.getByRole('button', { name: 'View solution', exact: true }).click();
    const modal = page.getByRole('dialog', { name: 'View solution', exact: true });
    await expect(modal).toBeVisible();
    await expect(modal.getByRole('tab', { name: 'main.py', exact: true })).toHaveAttribute('aria-selected', 'true');
    const modalBounds = await modal.boundingBox();
    expect(modalBounds!.width).toBeGreaterThan(600);
    expect(Math.abs(modalBounds!.x + modalBounds!.width / 2 - 720)).toBeLessThan(5);
    // Exercise the actual clipboard call without relying on browser OS permissions.
    await page.evaluate(() => { Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async (value: string) => { Object.assign(window, { copiedTurtleCode: value }); } }); });
    await modal.getByRole('button', { name: 'Copy main.py', exact: true }).click();
    await expect(modal.getByRole('button', { name: 'Copy main.py', exact: true })).toContainText('Copied');
    expect(await page.evaluate(() => (window as unknown as { copiedTurtleCode: string }).copiedTurtleCode)).toContain('t.forward(120)');
    await page.screenshot({ animations: 'disabled', path: info.outputPath('solution-modal.png') });
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
    await expect(page.getByRole('button', { name: 'View solution', exact: true })).toBeFocused();
    expect(await page.evaluate(() => (window as unknown as { monaco: { editor: { getModels(): Array<{ getValue(): string }> } } }).monaco.editor.getModels()[0].getValue())).toBe(sourceBefore);
    expect(sessions).toHaveLength(0);
    await page.getByRole('button', { name: 'View solution', exact: true }).click();
    await expect(modal).toBeVisible();
    await page.mouse.click(5, 300); await expect(modal).toBeHidden();

    const response = page.waitForResponse(response => response.url() === api + '/sessions' && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    expect((await response).status()).toBe(201);
    await painted(page);
    await expect(page.getByTestId('turtle-terminal')).toContainText('SQUARE_COMPLETE', { timeout: 45000 });
    // Wait for the entire picture, not merely the first animated blue segment.
    await expect.poll(() => page.getByTestId('turtle-display').locator('canvas').evaluate(node => {
      const canvas = node as HTMLCanvasElement;
      if (!canvas.width || !canvas.height) return 0;
      const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      let blue = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 2] > 140 && pixels[i] < 100 && pixels[i + 1] < 100) blue++;
      return blue;
    }), { timeout: 15000 }).toBeGreaterThan(1000);
    const count = sockets.length;
    const layout = page.getByRole('button', { name: 'Drawing layout', exact: true });
    expect(await layout.innerText()).toBe('Drawing layout'); // Accessible, visually hidden label.
    await layout.click();
    await page.getByRole('menuitemradio', { name: 'Drawing on right', exact: true }).click();
    await expect(page.locator('[data-layout=right]')).toBeVisible(); await painted(page);
    const divider = page.getByRole('separator', { name: 'Resize editor and results' });
    await divider.focus();
    const oldValue = Number(await divider.getAttribute('aria-valuenow'));
    await page.keyboard.press('ArrowUp');
    await expect(divider).toHaveAttribute('aria-valuenow', String(oldValue - 2));
    const bounds = await divider.boundingBox();
    await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + 3); await page.mouse.down();
    await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + 30, { steps: 5 }); await page.mouse.up();
    expect(Number(await divider.getAttribute('aria-valuenow'))).toBeGreaterThan(oldValue - 2);
    await page.screenshot({ animations: 'disabled', path: info.outputPath('drawing-right.png') });
    await page.getByRole('button', { name: 'Expand drawing', exact: true }).click();
    const expanded = page.getByRole('dialog', { name: 'Drawing', exact: true });
    await expect(expanded).toBeVisible(); await painted(page);
    await expect(expanded.getByRole('button', { name: 'Close drawing' })).toBeFocused();
    await page.getByRole('button', { name: 'Close drawing' }).click();
    expect(sockets).toHaveLength(count);
    await layout.click(); await page.getByRole('menuitemradio', { name: 'Drawing below', exact: true }).click();
    await painted(page); expect(sockets).toHaveLength(count);
    await page.screenshot({ animations: 'disabled', path: info.outputPath('drawing-below.png') });

    await page.getByRole('button', { name: 'View solution', exact: true }).click();
    const ranSolution = page.waitForResponse(response => response.url() === api + '/sessions' && response.request().method() === 'POST');
    await modal.getByRole('button', { name: 'Run solution', exact: true }).click();
    expect((await ranSolution).status()).toBe(201);
    await expect(modal).toBeHidden();
    await expect(page.getByText('Solution result', { exact: true })).toBeVisible(); await painted(page);
    expect(await page.evaluate(() => (window as unknown as { monaco: { editor: { getModels(): Array<{ getValue(): string }> } } }).monaco.editor.getModels()[0].getValue())).toBe(sourceBefore);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('tab', { name: 'Drawing', exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Drawing', exact: true }).click();
    await page.getByRole('button', { name: 'Expand drawing', exact: true }).click();
    await expect(expanded).toBeVisible(); await expect(expanded.getByRole('button', { name: 'Close drawing' })).toBeInViewport();
    await page.screenshot({ animations: 'disabled', path: info.outputPath('mobile-expanded.png') });
    await expanded.getByRole('button', { name: 'Close drawing' }).click();
    await page.getByRole('button', { name: 'View solution', exact: true }).click();
    await expect(modal).toBeVisible();
    const mobileModal = await modal.boundingBox(); expect(mobileModal!.width).toBeLessThan(391);
    await expect(modal.getByRole('button', { name: 'Close', exact: true })).toBeInViewport();
    await page.screenshot({ animations: 'disabled', path: info.outputPath('mobile-solution.png') });
    await modal.getByRole('button', { name: 'Close', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);

    const studentContext = await browser.newContext();
    const student = await studentContext.newPage(); let studentAuthorization = '';
    student.on('request', request => { if (request.headers().authorization?.startsWith('Bearer ')) studentAuthorization = request.headers().authorization; });
    await signInAs({ page: student, identifier: 'student@cove.test', password: 'CoveDev123!', initialPath: `/academy/development-academy/learn/turtle/${materialId}?classId=a1000000-0000-4000-8000-000000000040` });
    await expect(student.getByRole('button', { name: 'Run', exact: true })).toBeVisible();
    await expect(student.getByRole('button', { name: 'View solution', exact: true })).toHaveCount(0);
    await expect.poll(() => studentAuthorization).not.toBe('');
    const forbidden = await student.request.get(api, { headers: { Authorization: studentAuthorization }, params: { academyId: demo!.academyId, materialId, preview: 'true' } });
    expect(forbidden.status()).toBe(403);
    await studentContext.close();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.context().addCookies([{ name: 'i18next', value: 'ko', domain: 'localhost', path: '/' }]);
    await page.goto(path);
    await page.getByRole('button', { name: '해설 보기', exact: true }).click();
    const koreanModal = page.getByRole('dialog', { name: '해설 보기', exact: true });
    await expect(koreanModal).toBeVisible();
    await expect(koreanModal.getByRole('tab', { name: 'main.py', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(koreanModal.getByRole('button', { name: '닫기', exact: true })).toBeVisible();
    await page.screenshot({ animations: 'disabled', path: info.outputPath('korean-solution.png') });
    await koreanModal.getByRole('button', { name: '닫기', exact: true }).click();
    await expect(page.getByRole('button', { name: '그림 배치', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    for (const id of sessions) await page.request.delete(`${api}/sessions/${id}`, { headers: { Authorization: authorization } });
  }
});
