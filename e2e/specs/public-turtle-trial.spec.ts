import { test, expect, type Page } from '@playwright/test';

async function enter(page: Page) {
  await page.goto('/turtle');
  await page.getByLabel(/체험 코드|Classroom code/).fill('012345');
  await page.getByRole('button', { name: /시작하기|Start drawing/ }).click();
  await expect(page.getByLabel(/파이썬 코드|Python code/, { exact: true })).toBeVisible();
}
async function code(page: Page, source: string) {
  await expect(page.locator('.monaco-editor')).toBeVisible();
  await expect.poll(() => page.evaluate(next => {
    const model = (window as unknown as { monaco?: { editor: { getModels(): Array<{ setValue(v: string): void; getValue(): string }> } } }).monaco?.editor.getModels()[0];
    if (!model) return false;
    model.setValue(next); return model.getValue() === next;
  }, source)).toBe(true);
  // Wait for the editor's real change callback and tab-local persistence, so
  // Run cannot race a synthetic IME/input event still pending inside Monaco.
  await expect.poll(() => page.evaluate(() => {
    const d = JSON.parse(sessionStorage.getItem('cove:turtle:tab:v1') ?? '{}');
    return d.buffers?.[d.starter];
  })).toBe(source);
}

test('PIN, helpers, drawing, export, refresh and mobile controls work without an account', async ({ page }, testInfo) => {
  const identityRequests: string[] = [];
  const bootstrapFailures: number[] = [];
  page.on('response', response => { if (response.url().endsWith('/turtle/api/bootstrap') && response.status() >= 400) bootstrapFailures.push(response.status()); });
  page.on('request', request => { if (/unused\.invalid|\/auth\/v1\//.test(request.url())) identityRequests.push(request.url()); });
  await page.goto('/turtle');
  await page.getByLabel(/체험 코드|Classroom code/).fill('999999');
  await page.getByRole('button', { name: /시작하기|Start drawing/ }).click();
  await expect(page.locator('#trial-error')).toContainText(/코드가 맞지|code doesn’t match/);
  await page.screenshot({ path: testInfo.outputPath('access.png') });
  await page.getByLabel(/체험 코드|Classroom code/).fill('012345');
  await page.getByRole('button', { name: /시작하기|Start drawing/ }).click();
  const source = 'from custom import *\nspeed(0)\ncolor("red")\nfor i in range(4):\n    TForward(100)\n    TLeft(90)\nprint("SQUARE_OK")\n';
  await code(page, source);
  await page.getByRole('button', { name: /^(실행|Run)$/ }).click();
  await expect(page.getByRole('region', { name: /^(출력|Output)$/ })).toContainText('SQUARE_OK');
  const canvas = page.locator('[data-testid="turtle-display"] canvas');
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => {
    const pixels = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data;
    let red = 0; for (let i = 0; i < pixels.length; i += 4) if (pixels[i]! > 160 && pixels[i + 1]! < 120 && pixels[i + 2]! < 120) red++;
    return red;
  })).toBeGreaterThan(100);
  await expect(page.getByText(/Release keyboard|키보드 해제/, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Space', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /^(밝게|Light)$/ }).click();
  await expect(page.locator('.monaco-editor.vs')).toBeVisible();
  await page.getByRole('button', { name: /^(어둡게|Dark)$/ }).click();
  await page.screenshot({ path: testInfo.outputPath('workspace.png') });
  await page.getByRole('button', { name: /^(중지|Stop)$/ }).click();
  await expect(page.getByAltText(/마지막 거북이 그림|Last turtle drawing/)).toBeVisible();
  await page.getByRole('button', { name: /더 보기|More options/ }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /전체 프로젝트|Project with helpers/ }).click();
  expect((await download).suggestedFilename()).toBe('cove-turtle.zip');
  await expect(page.getByRole('dialog', { name: /더 보기|More options/ })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.monaco-editor')).toContainText('SQUARE_OK');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: /^(그림|Drawing)$/ }).click();
  await expect(page.getByRole('button', { name: /^(실행|Run)$/ })).toBeVisible();
  await page.getByRole('tab', { name: /^(코드|Code)$/ }).click();
  await expect(page.locator('.monaco-editor')).toBeVisible();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('SQUARE_OK');
  await page.screenshot({ path: testInfo.outputPath('mobile.png') });
  await page.getByRole('button', { name: /더 보기|More options/ }).click();
  await page.getByRole('button', { name: /^(나가기|Exit)$/ }).click();
  await expect(page.getByLabel(/체험 코드|Classroom code/)).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('cove:turtle:tab:v1') ?? '')).not.toContain('SQUARE_OK');
  expect(identityRequests).toEqual([]);
  expect(bootstrapFailures).toEqual([]);
});

test('race helpers and infinite loops run in isolated stoppable sessions', async ({ page }) => {
  await enter(page);
  await page.getByRole('button', { name: /더 보기|More options/ }).click();
  await page.getByRole('button', { name: /기본 코드 선택|Choose a starter/ }).click();
  await page.getByRole('menuitemradio', { name: /거북이 경주|Turtle race/ }).click();
  await page.getByRole('button', { name: /더 보기|More options/ }).click();
  await code(page, 'from custom import *\nReadyToRace()\nBlueForward(740)\nassert BlueX() > 330\nassert PinkX() == -400\nPinkForward(-10)\nassert PinkX() == -410\nfor i in range(36):\n    BlueLeft(10)\nprint("RACE_OK")\n');
  await page.getByRole('button', { name: /^(실행|Run)$/ }).click();
  await expect(page.getByRole('region', { name: /^(출력|Output)$/ })).toContainText('RACE_OK');
  await expect(page.getByRole('button', { name: /^(실행|Run)$/ })).toBeEnabled();
  await code(page, 'while True:\n    pass\n');
  await page.getByRole('button', { name: /^(실행|Run)$/ }).click();
  await expect(page.getByRole('button', { name: /^(중지|Stop)$/ })).toBeEnabled();
  await page.getByRole('button', { name: /^(중지|Stop)$/ }).click();
  await expect(page.getByRole('button', { name: /^(실행|Run)$/ })).toBeEnabled();
  await page.getByRole('button', { name: /더 보기|More options/ }).click();
  await page.getByRole('button', { name: /^(나가기|Exit)$/ }).click();
});


test('the turtle cursor animates on a white canvas and Clear keeps the code', async ({ page }, testInfo) => {
  await enter(page);
  const source = 'import turtle\nt = turtle.Turtle("turtle")\nt.color("green")\nt.speed(1)\nt.forward(200)\nt.left(90)\nt.forward(160)\nprint("ANIMATION_DONE")\n';
  await code(page, source);
  await page.getByRole('button', { name: /^(실행|Run)$/ }).click();
  const canvas = page.locator('[data-testid="turtle-display"] canvas');
  await expect(canvas).toBeVisible();
  const frames = new Set<string>();
  await expect.poll(async () => {
    frames.add(await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL()));
    return frames.size;
  }).toBeGreaterThan(1);
  await expect(page.getByRole('region', { name: /^(출력|Output)$/ })).toContainText('ANIMATION_DONE');
  await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => {
    const pixels = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data;
    let green = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i]! < 80 && pixels[i + 1]! > 80 && pixels[i + 2]! < 80) green++;
    return green;
  })).toBeGreaterThan(100);
  await page.screenshot({ path: testInfo.outputPath('animated-turtle.png') });
  await page.getByRole('button', { name: /^(지우기|Clear)$/ }).click();
  await expect(canvas).toHaveCount(0);
  await expect(page.getByRole('region', { name: /^(출력|Output)$/ })).toBeEmpty();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('t.forward(200)');
  await page.getByRole('button', { name: /더 보기|More options/ }).click();
  await page.getByRole('button', { name: /^(나가기|Exit)$/ }).click();
});


test('the lesson star uses a bold pen and cleans up an already disconnected viewer', async ({ page, request }, testInfo) => {
  const viewerErrors: string[] = [];
  page.on('console', message => {
    if (/Tried changing state of a disconnected RFB object/.test(message.text())) viewerErrors.push(message.text());
  });
  await enter(page);
  await code(page, 'from custom import *\nimport turtle\ncolor("blue")\nspeed(3)\nassert turtle.pensize() == 5\nfor i in range(5):\n    TForward(180)\n    TLeft(144)\nprint("My first star!")\n');
  const creation = page.waitForResponse(response => response.url().endsWith('/turtle/api/runs') && response.request().method() === 'POST');
  const started = Date.now();
  await page.getByRole('button', { name: /^(실행|Run)$/ }).click();
  const run = await (await creation).json();
  await expect(page.getByRole('region', { name: /^(출력|Output)$/ })).toContainText('My first star!');
  expect(Date.now() - started).toBeGreaterThan(2500);
  await expect(page.locator('[data-testid="turtle-display"] canvas')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('bold-star.png') });
  // End the real broker session independently, as happens on expiry/network loss.
  // The viewer must not call disconnect again on noVNC's terminal instance.
  const stopped = await request.delete('http://127.0.0.1:4017/sessions/' + run.id, {
    headers: { Authorization: 'Bearer local-trial-runtime-secret-never-production' },
  });
  expect(stopped.ok()).toBe(true);
  await expect(page.getByAltText(/마지막 거북이 그림|Last turtle drawing/)).toBeVisible();
  await page.getByRole('button', { name: /^(지우기|Clear)$/ }).click();
  await expect(page.getByRole('button', { name: /^(중지|Stop)$/ })).toHaveCount(0);
  expect(viewerErrors).toEqual([]);
  await page.getByRole('button', { name: /더 보기|More options/ }).click();
  await page.getByRole('button', { name: /^(나가기|Exit)$/ }).click();
});

test('Cove settings dismiss correctly and language changes preserve the code', async ({ page }, testInfo) => {
  await page.goto('/turtle');
  await page.getByRole('button', { name: /언어|Language/ }).click();
  await page.getByRole('menuitemradio', { name: '한국어', exact: true }).click();
  await expect(page.getByLabel('체험 코드', { exact: true })).toBeVisible();
  await page.getByLabel('체험 코드', { exact: true }).fill('012345');
  await page.getByRole('button', { name: '시작하기', exact: true }).click();
  await expect(page.getByLabel('파이썬 코드', { exact: true })).toBeVisible();
  const source = 'import turtle\nt = turtle.Turtle("turtle")\nassert t.pensize() == 5\nassert t.shapesize() == (2, 2, 2)\nt.pensize(3)\nassert t.pensize() == 3\nt.color("purple")\nt.speed(0)\nfor i in range(4):\n    t.forward(100)\n    t.left(90)\nprint("STANDARD_TURTLE_OK")\n';
  await code(page, source);
  await page.getByRole('button', { name: '더 보기', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '더 보기', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '기본 코드 선택', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '거북이 경주', exact: true }).click();
  await expect(page.getByRole('button', { name: '기본 코드 선택', exact: true })).toHaveText('거북이 경주');
  await page.getByRole('button', { name: '기본 코드 선택', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '도형 그리기', exact: true }).click();
  await page.getByRole('button', { name: '글자 크기', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '22px', exact: true }).click();
  await expect(page.getByRole('button', { name: '글자 크기', exact: true })).toHaveText('22px');
  await page.getByRole('region', { name: '파이썬 코드', exact: true }).click({ position: { x: 20, y: 20 } });
  await expect(page.getByRole('dialog', { name: '더 보기', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '더 보기', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '더 보기', exact: true })).toHaveCount(0);
  // Observe every DOM update in the next document, not only its final state.
  await page.addInitScript(() => {
    const state = { pinShown: false };
    (window as unknown as { turtleAccessCheck: typeof state }).turtleAccessCheck = state;
    new MutationObserver(() => {
      if (document.getElementById('turtle-pin')) state.pinShown = true;
    }).observe(document, { childList: true, subtree: true });
  });
  let releaseBootstrap!: () => void;
  const bootstrapReady = new Promise<void>(resolve => { releaseBootstrap = resolve; });
  await page.route('**/turtle/api/bootstrap', async route => {
    await bootstrapReady;
    await route.continue();
  });
  await page.getByRole('button', { name: /언어|Language/ }).click();
  try {
    await page.getByRole('menuitemradio', { name: 'English', exact: true }).click({ noWaitAfter: true });
    await expect(page.getByTestId('turtle-restoring')).toBeVisible();
    await expect(page.locator('#turtle-pin')).toHaveCount(0);
  } finally { releaseBootstrap(); }
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { turtleAccessCheck: { pinShown: boolean } }).turtleAccessCheck.pinShown)).toBe(false);
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('STANDARD_TURTLE_OK');
  await page.getByRole('button', { name: 'More options', exact: true }).click();
  await page.getByRole('button', { name: 'Commands', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'More options', exact: true })).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Command reference' })).toContainText('Move forward 100 steps.');
  await page.getByRole('button', { name: 'Close help', exact: true }).click();
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Output', exact: true })).toContainText('STANDARD_TURTLE_OK');
  const canvas = page.locator('[data-testid="turtle-display"] canvas');
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => {
    const pixels = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data;
    let purple = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i]! > 80 && pixels[i + 1]! < 60 && pixels[i + 2]! > 80) purple++;
    return purple;
  })).toBeGreaterThan(2000);
  await page.screenshot({ path: testInfo.outputPath('standard-turtle-english.png') });
  await page.getByRole('button', { name: 'More options', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'More options', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('cove-settings.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Exit', exact: true }).click();
});
