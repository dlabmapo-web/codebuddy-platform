import { test, expect, type Page } from '@playwright/test';
import { turtleSpiralExample } from '../../packages/shared/src/turtle-trial/index';

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

test('admission preloads the viewer without creating a run or display connection', async ({ page }) => {
  const runs: string[] = [], sockets: string[] = [];
  page.on('request', r => { if (r.url().endsWith('/turtle/api/runs')) runs.push(r.method()); });
  page.on('websocket', s => sockets.push(s.url()));
  const viewer = page.waitForResponse(r => r.url().includes('/novnc-rfb.js'));
  await enter(page);
  expect((await viewer).ok()).toBe(true);
  expect(runs).toEqual([]);
  expect(sockets.filter(s => s.includes('/display'))).toEqual([]);
  await page.getByRole('button', { name: /더 보기|More options/ }).click();
  await page.getByRole('button', { name: /^(나가기|Exit)$/ }).click();
});

test('failed viewer preload leaves the editor usable and retries on Run', async ({ page }) => {
  let attempts = 0;
  await page.route('**/novnc-rfb.js*', async route => {
    attempts++;
    if (attempts === 1) await route.abort(); else await route.continue();
  });
  await enter(page);
  await expect.poll(() => attempts).toBe(1);
  await code(page, 'from custom import *\nspeed(0)\ncolor("red")\nTForward(100)\nprint("PRELOAD_RETRY_OK")\n');
  await page.getByRole('button', { name: /^(실행|Run)$/ }).click();
  await expect(page.getByRole('region', { name: /^(출력|Output)$/ })).toContainText('PRELOAD_RETRY_OK');
  await expect(page.locator('[data-testid="turtle-display"] canvas')).toBeVisible();
  expect(attempts).toBe(2);
  await page.getByRole('button', { name: /더 보기|More options/ }).click();
  await page.getByRole('button', { name: /^(나가기|Exit)$/ }).click();
});

test('six-box entry supports paste, editing, visibility, errors and mobile layout', async ({ page }, testInfo) => {
  await page.goto('/turtle');
  const pin = page.getByLabel(/체험 코드|Classroom code/, { exact: true });
  const start = page.getByRole('button', { name: /시작하기|Start drawing/ });
  await expect(pin).toBeEnabled();
  await expect(start).toBeDisabled();
  await pin.fill('012');
  await expect(start).toBeDisabled();
  await pin.evaluate(element => {
    const data = new DataTransfer(); data.setData('text/plain', '012 345');
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(pin).toHaveValue('012345');
  await expect(start).toBeEnabled();
  await expect(pin).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: /^(코드 보기|Show code)$/ }).click();
  await expect(pin).toHaveAttribute('type', 'text');
  await expect(pin).toHaveValue('012345');
  await page.getByRole('button', { name: /^(코드 숨기기|Hide code)$/ }).click();
  await pin.focus();
  await pin.press('ControlOrMeta+A');
  await pin.press('ArrowRight');
  await pin.press('ArrowLeft');
  await pin.press('Backspace');
  await expect(pin).toHaveValue('01235');
  await pin.press('4');
  await expect(pin).toHaveValue('012345');
  await pin.fill('999999');
  await pin.press('Enter');
  await expect(page.locator('#trial-error')).toBeVisible();
  await expect(pin).toHaveAttribute('aria-invalid', 'true');
  await pin.fill('012345');
  await expect(page.locator('#trial-error')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('six-digit-entry-desktop.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 360, height: 780 });
  await expect(start).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('six-digit-entry-mobile.png'), animations: 'disabled' });
  await pin.press('Enter');
  await expect(page.getByLabel(/파이썬 코드|Python code/, { exact: true })).toBeVisible();
});

test('Korean entry stays readable on small phones, tablets and desktop', async ({ page }, testInfo) => {
  await page.goto('/turtle');
  await page.getByRole('button', { name: /^(언어|Language)$/ }).click();
  await page.getByRole('menuitemradio', { name: '한국어', exact: true }).click();
  const pin = page.getByLabel('체험 코드', { exact: true });
  await expect(pin).toBeEnabled();
  await expect(page.getByText('코드를 모르겠다면 선생님께 물어보세요.')).toBeVisible();
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('button', { name: '시작하기', exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`korean-entry-${width}.png`), animations: 'disabled' });
  }
});

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
  // The long forward movement and celebration animate at classroom speed.
  await expect(page.getByRole('region', { name: /^(출력|Output)$/ })).toContainText('RACE_OK', { timeout: 60000 });
  await expect(page.getByRole('button', { name: /^(실행|Run)$/ })).toBeEnabled();
  await code(page, 'while True:\n    pass\n');
  await page.getByRole('button', { name: /^(실행|Run)$/ }).click();
  await expect(page.getByRole('button', { name: /^(중지|Stop)$/ })).toBeEnabled();
  await page.getByRole('button', { name: /^(중지|Stop)$/ }).click();
  await expect(page.getByRole('button', { name: /^(실행|Run)$/ })).toBeEnabled();
  await page.getByRole('button', { name: /더 보기|More options/ }).click();
  await page.getByRole('button', { name: /^(나가기|Exit)$/ }).click();
});

test('switching examples clears live and stopped results while preserving each code buffer', async ({ page }) => {
  await enter(page);
  const shapeSource = 'from custom import *\nspeed(0)\nTForward(80)\nprint("SHAPE_BUFFER")\n';
  await code(page, shapeSource);
  const choose = async (name: RegExp) => {
    await page.getByRole('button', { name: /더 보기|More options/ }).click();
    await page.getByRole('button', { name: /기본 코드 선택|Choose a starter/ }).click();
    await page.getByRole('menuitemradio', { name }).click();
  };
  const closeOptions = () => page.getByRole('button', { name: /더 보기|More options/ }).click();
  await choose(/거북이 경주|Turtle race/);
  await closeOptions();
  const raceSource = 'from custom import *\nReadyToRace()\nBlueForward(30)\nprint("RACE_BUFFER")\n';
  await code(page, raceSource);
  const creation = page.waitForResponse(response => response.url().endsWith('/turtle/api/runs') && response.request().method() === 'POST');
  await page.getByRole('button', { name: /^(실행|Run)$/ }).click();
  const race = await (await creation).json();
  const output = page.getByRole('region', { name: /^(출력|Output)$/ });
  const canvas = page.locator('[data-testid="turtle-display"] canvas');
  const retained = page.getByAltText(/마지막 거북이 그림|Last turtle drawing/);
  await expect(output).toContainText('RACE_BUFFER');
  await expect(canvas).toBeVisible();
  await choose(/거북이 경주|Turtle race/);
  await closeOptions();
  await expect(output).toContainText('RACE_BUFFER');
  await expect(canvas).toBeVisible();

  // A failed cleanup must keep the old example selected and allow a retry.
  const raceUrl = '**/turtle/api/runs/' + race.id;
  await page.route(raceUrl, route => route.request().method() === 'DELETE'
    ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"REQUEST_FAILED"}' })
    : route.continue());
  await choose(/도형 그리기|Draw shapes/);
  // Monaco and Next's route announcer also expose alerts; assert the actual
  // classroom cleanup error rather than all live regions on the page.
  await expect(page.getByRole('alert').filter({ hasText: /classroom connection|연결/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /기본 코드 선택|Choose a starter/ })).toHaveText(/거북이 경주|Turtle race/);
  await closeOptions();
  await expect(output).toContainText('RACE_BUFFER');
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('RACE_BUFFER');
  await page.unroute(raceUrl);

  // A late status response from the old race must not restore its results.
  let releasePoll!: () => void;
  let pollHeld = false;
  const pollReleased = new Promise<void>(resolve => { releasePoll = resolve; });
  await page.route(raceUrl, async route => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    pollHeld = true;
    await pollReleased;
    await route.fulfill({ response });
  });
  try {
    await expect.poll(() => pollHeld).toBe(true);
    const stopped = page.waitForResponse(response => response.url().endsWith('/runs/' + race.id) && response.request().method() === 'DELETE', { timeout: 20000 });
    await choose(/도형 그리기|Draw shapes/);
    expect((await stopped).ok()).toBe(true);
    await expect(page.getByRole('button', { name: /기본 코드 선택|Choose a starter/ })).toHaveText(/도형 그리기|Draw shapes/);
    await closeOptions();
    const oldStatus = page.waitForResponse(response => response.url().endsWith('/runs/' + race.id) && response.request().method() === 'GET');
    releasePoll();
    await oldStatus;
    await expect(canvas).toHaveCount(0);
    await expect(retained).toHaveCount(0);
    await expect(output).toBeEmpty();
    await expect(page.getByRole('button', { name: /^(중지|Stop)$/ })).toHaveCount(0);
    await expect(page.locator('.monaco-editor .view-lines')).toContainText('SHAPE_BUFFER');
  } finally {
    releasePoll();
    await page.unroute(raceUrl);
  }

  await choose(/거북이 경주|Turtle race/);
  await closeOptions();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('RACE_BUFFER');
  await expect(output).toBeEmpty();
  await choose(/자유 연습|Free practice/);
  await closeOptions();
  await code(page, 'from custom import *\nspeed(0)\nTForward(60)\nprint("FREE_BUFFER")\n');
  await page.getByRole('button', { name: /^(실행|Run)$/ }).click();
  await expect(output).toContainText('FREE_BUFFER');
  await expect(canvas).toBeVisible();
  await page.getByRole('button', { name: /^(중지|Stop)$/ }).click();
  await expect(retained).toBeVisible();
  await choose(/도형 그리기|Draw shapes/);
  await closeOptions();
  await expect(retained).toHaveCount(0);
  await expect(canvas).toHaveCount(0);
  await expect(output).toBeEmpty();
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('SHAPE_BUFFER');
  await page.getByRole('button', { name: /^(실행|Run)$/ }).click();
  await expect(output).toContainText('SHAPE_BUFFER');
  await expect(canvas).toBeVisible();
  await page.getByRole('button', { name: /더 보기|More options/ }).click();
  await page.getByRole('button', { name: /^(나가기|Exit)$/ }).click();
});


test('the turtle cursor animates on a white canvas and Clear keeps the code', async ({ page }, testInfo) => {
  await enter(page);
  const source = 'from custom import *\ncolor("green")\nspeed(1)\nTForward(200)\nTLeft(90)\nTForward(160)\nprint("ANIMATION_DONE")\n';
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
  await expect(page.locator('.monaco-editor .view-lines')).toContainText('TForward(200)');
  await page.getByRole('button', { name: /더 보기|More options/ }).click();
  await page.getByRole('button', { name: /^(나가기|Exit)$/ }).click();
});

test('the custom module draws the beginner spiral without creating an object', async ({ page }, testInfo) => {
  await enter(page);
  await page.getByRole('button', { name: /더 보기|More options/ }).click();
  await page.getByRole('button', { name: /^(명령어 도움말|Commands)$/ }).click();
  const help = page.getByRole('complementary', { name: /명령어 도움말|Command reference/ });
  await expect(help).toContainText('from custom import *');
  await expect(help).toContainText('TForward(i * 4)');
  await expect(help).not.toContainText('turtle.forward');
  await page.getByRole('button', { name: /도움말 닫기|Close help/ }).click();
  await code(page, turtleSpiralExample + '\nassert speed() == 3\nprint("CUSTOM_SPIRAL_OK")\n');
  await page.getByRole('button', { name: /^(실행|Run)$/ }).click();
  await expect(page.getByRole('region', { name: /^(출력|Output)$/ })).toContainText('CUSTOM_SPIRAL_OK', { timeout: 60000 });
  const canvas = page.locator('[data-testid="turtle-display"] canvas');
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.evaluate((element: HTMLCanvasElement) => {
    const pixels = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data;
    let blue = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i]! < 80 && pixels[i + 1]! < 80 && pixels[i + 2]! > 160) blue++;
    return blue;
  })).toBeGreaterThan(2000);
  await page.screenshot({ path: testInfo.outputPath('custom-module-spiral.png') });
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
