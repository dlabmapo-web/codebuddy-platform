import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { signInAs } from '../support/auth';
import { routes } from '../../packages/web/src/lib/routes';

test.describe.configure({ mode: 'serial', timeout: 180_000 });
const studentCount = Number(process.env.E2E_MONITORING_STUDENTS ?? 5);
if (![5, 10, 15].includes(studentCount)) throw new Error('Use 5, 10 or 15 monitoring students');
const classId = 'e0000000-0000-4000-8000-000000000040';
const sum = 'e0000000-0000-4000-8000-000000000031';
const crlf = 'e0000000-0000-4000-8000-000000000034';
const academySlug = 'development-academy';
let teacher: BrowserContext;
const contexts: BrowserContext[] = [];
const students: Page[] = [];
const watches: Page[] = [];
let duplicate: Page;
const originals: string[] = [];
// Dedicated students keep a user's ordinary development student window out of this fixture.
const membership = (i: number) => `40000000-0000-4000-8000-${String(102 + i).padStart(12, '0')}`;
const live = (i: number) => routes.academyTeachStudentLive(academySlug, classId, membership(i));
const exercise = (id = sum) => routes.academyLearnExercise(academySlug, id, { classId });

async function accessToken(context: BrowserContext) {
  const chunks = (await context.cookies()).filter(cookie => /^sb-.+-auth-token(\.\d+)?$/.test(cookie.name))
    .sort((a, b) => Number(/\.(\d+)$/.exec(a.name)?.[1] ?? 0) - Number(/\.(\d+)$/.exec(b.name)?.[1] ?? 0));
  const raw = decodeURIComponent(chunks.map(cookie => cookie.value).join(''));
  return JSON.parse(raw.startsWith('base64-') ? Buffer.from(raw.slice(7), 'base64').toString('utf8') : raw).access_token as string;
}

async function storedDraft(page: Page) {
  const response = await page.request.post('http://localhost:4000/api/rpc/learn/getExerciseWorkspace', {
    headers: { Authorization: `Bearer ${await accessToken(page.context())}` },
    data: { json: { academyId: '20000000-0000-4000-8000-000000000001', classId, materialId: sum } },
  });
  expect(response.status()).toBe(200);
  return (await response.json()).json.draft as { code: string; updatedAt: string } | null;
}

async function text(page: Page) {
  return page.evaluate(() => (window as any).monaco?.editor.getModels()[0]?.getValue() ?? '');
}
async function edit(page: Page, value: string) {
  await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => page.evaluate(() => Boolean((window as any).monaco?.editor.getModels()[0])), { timeout: 45_000 }).toBe(true);
  await page.evaluate(value => (window as any).monaco.editor.getModels()[0].setValue(value), value);
}
async function matches(page: Page, value: string) {
  await expect.poll(() => text(page), { timeout: 30_000 }).toBe(value);
}
async function ready(page: Page) {
  await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole('button', { name: /Read-only|읽기 전용/i })).toBeEnabled({ timeout: 45_000 });
}
async function help(page: Page) {
  await page.getByRole('button', { name: /Read-only|읽기 전용/i }).click();
  await expect(page.locator('button[aria-pressed="true"]').filter({ hasText: /Help|편집/i })).toBeVisible();
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(studentCount * 75_000);
  teacher = await browser.newContext();
  const login = await teacher.newPage();
  await signInAs({ page: login, identifier: 'teacher@cove.test', password: 'CoveDev123!' });
  for (let i = 0; i < studentCount; i++) {
    const context = await browser.newContext({ viewport: { width: 1100 + i * 40, height: 800 } });
    contexts.push(context);
    const page = await context.newPage(); students.push(page);
    await signInAs({ page, identifier: `student${i + 2}@cove.test`, password: 'CoveDev123!', initialPath: exercise() });
    await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 45_000 });
    await expect.poll(() => page.evaluate(() => Boolean((window as any).monaco?.editor.getModels()[0])), { timeout: 45_000 }).toBe(true);
    originals.push(await text(page));
    await edit(page, `# student-${i}\nvalue = ${i}\n`);
    const watch = await teacher.newPage(); watches.push(watch);
    await watch.goto(live(i)); await ready(watch);
    console.log(`Monitoring fixture ready: ${i + 1}/${studentCount} student/watch pairs`);
  }
  await login.close();
});

test.afterAll(async () => {
  test.setTimeout(120_000);
  try {
    for (let i = 0; i < students.length; i++) {
      if (originals[i] !== undefined && !students[i]!.isClosed()) {
        if (!new URL(students[i]!.url()).pathname.endsWith(`/${sum}`)) await students[i]!.goto(exercise());
        await edit(students[i]!, originals[i]!);
      }
    }
  } finally {
    await teacher?.close();
    for (const context of contexts) await context.close();
  }
});

test(`${studentCount} tabs receive distinct full-text updates after the last opens`, async ({}, info) => {
  const started = Date.now();
  for (let i = 0; i < studentCount; i++) await edit(students[i]!, `# live-${i}\nvalue = ${i + 10}\n`);
  for (let i = 0; i < studentCount; i++) await matches(watches[i]!, `# live-${i}\nvalue = ${i + 10}\n`);
  const deliveryMs = Date.now() - started;
  const resources: unknown[] = [];
  if (info.project.name === 'chromium') {
    for (const page of watches) {
      const cdp = await teacher.newCDPSession(page);
      await cdp.send('Performance.enable');
      const { metrics } = await cdp.send('Performance.getMetrics');
      resources.push(metrics.filter(metric => ['JSHeapUsedSize', 'Nodes', 'Documents'].includes(metric.name)));
      await cdp.detach();
    }
  }
  await info.attach('five-stream-delivery', { body: JSON.stringify({ deliveryMs, streams: studentCount, teacherPageResources: resources, note: 'Development run on one shared machine; not a capacity benchmark.' }), contentType: 'application/json' });
});

test('duplicate watch closure preserves the other four students and original watch', async () => {
  duplicate = await teacher.newPage(); await duplicate.goto(live(0)); await ready(duplicate);
  await edit(students[0]!, '# duplicate\nprint(0)\n');
  await matches(duplicate, '# duplicate\nprint(0)\n');
  await duplicate.close();
  await edit(students[0]!, '# after-close\nprint(1)\n');
  await matches(watches[0]!, '# after-close\nprint(1)\n');
  for (let i = 1; i < studentCount; i++) await ready(watches[i]!);
});

test('read-only rejects forged edits and help mode permits only the chosen watch', async () => {
  const before = await text(students[0]!);
  for (let attempt = 0; attempt < 3; attempt++) {
    await edit(watches[0]!, `# forbidden-${attempt}\n`);
    await matches(watches[0]!, before);
    await matches(students[0]!, before);
    await ready(watches[0]!);
  }
  await ready(watches[0]!); await help(watches[0]!);
  await edit(watches[0]!, '# teacher-help\nprint(2)\n');
  await matches(students[0]!, '# teacher-help\nprint(2)\n');
  await expect(students[0]!.getByText(/Teacher is helping|도와주고/)).toBeVisible();
  await ready(watches[1]!);
});

test('reload resets help mode without interrupting another student', async () => {
  await watches[0]!.reload(); await ready(watches[0]!);
  await edit(students[1]!, '# survives-reload\nprint(3)\n');
  await matches(watches[1]!, '# survives-reload\nprint(3)\n');
});

test('exercise navigation and CRLF draft return stay isolated', async () => {
  const originalA = await text(students[0]!);
  const originalOther = await text(students[1]!);
  await students[0]!.goto(exercise(crlf));
  await edit(students[0]!, '# CRLF 🎉\r\nprint(4)\r\n');
  await watches[0]!.reload(); await ready(watches[0]!);
  await matches(watches[0]!, '# CRLF 🎉\nprint(4)\n');
  await students[0]!.evaluate(() => {
    const editor = (window as any).monaco.editor.getEditors()[0];
    editor.setPosition({ lineNumber: 2, column: 1 }); editor.focus();
  });
  await students[0]!.keyboard.insertText('# hi 🎉\n');
  await matches(watches[0]!, '# CRLF 🎉\n# hi 🎉\nprint(4)\n');
  await students[0]!.goto(exercise());
  await watches[0]!.reload(); await ready(watches[0]!);
  await matches(watches[0]!, originalA);
  await matches(watches[1]!, originalOther);
});

test('transport reconnect synchronizes five watches in read-only mode', async () => {
  await teacher.setOffline(true);
  await edit(students[2]!, '# while-offline\nprint(5)\n');
  await teacher.setOffline(false);
  for (const watch of watches) await ready(watch);
  await matches(watches[2]!, '# while-offline\nprint(5)\n');
});

test('duplicate pointers remain distinct and leaving clears only one', async () => {
  duplicate = await teacher.newPage(); await duplicate.goto(live(0)); await ready(duplicate);
  let movement = 0;
  // Keep both peers active while measuring coexistence. Teacher arrows expire
  // after inactivity, so waiting for readiness must not consume their lifetime.
  await expect(async () => {
    for (const page of [watches[0]!, duplicate]) {
      const box = await page.locator('[data-collab-surface="statement"]').boundingBox();
      await page.mouse.move(box!.x + 30, box!.y + 30);
      await page.mouse.move(box!.x + 50 + movement % 2, box!.y + 45, { steps: 4 });
    }
    movement++;
    await expect(students[0]!.getByTestId('peer-pointer')).toHaveCount(2, { timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await duplicate.close();
  await expect(students[0]!.getByTestId('peer-pointer')).toHaveCount(1);
});

test('watch join and leave preserve a long statement and its iframe', async () => {
  await watches[0]!.close();
  await students[0]!.goto(exercise(crlf));
  const selector = '[data-collab-surface="statement"] iframe';
  const frame = students[0]!.locator(selector).first();
  const original = await frame.elementHandle();
  await expect(students[0]!.frameLocator(selector).locator('p')).toHaveCount(40);
  await frame.evaluate(frame => {
    const iframe = frame as HTMLIFrameElement;
    const paragraph = iframe.contentDocument!.querySelectorAll('p')[20]!;
    const pane = iframe.closest('[data-collab-surface="statement"]')!;
    pane.scrollTop += iframe.getBoundingClientRect().top + paragraph.getBoundingClientRect().top - pane.getBoundingClientRect().top - 8;
  });
  // The contract preserves the visible text boundary. A paragraph's line box
  // includes leading that changes under canvas scaling (notably in WebKit).
  const anchorOffset = () => frame.evaluate(frame => {
    const iframe = frame as HTMLIFrameElement;
    const paragraph = iframe.contentDocument!.querySelectorAll('p')[20]!;
    const range = iframe.contentDocument!.createRange();
    range.setStart(paragraph.firstChild!, 0); range.setEnd(paragraph.firstChild!, 1);
    const box = iframe.getBoundingClientRect();
    const pane = iframe.closest('[data-collab-surface="statement"]')!;
    return box.top + range.getBoundingClientRect().top * box.height / iframe.offsetHeight - pane.getBoundingClientRect().top;
  });
  const before = await anchorOffset();
  watches[0] = await teacher.newPage(); await watches[0]!.goto(live(0)); await ready(watches[0]!);
  await expect.poll(() => original!.evaluate(frame => frame.isConnected)).toBe(true);
  await expect.poll(async () => Math.abs(await anchorOffset() - before)).toBeLessThanOrEqual(2);
  await watches[0]!.close();
  await expect.poll(async () => Math.abs(await anchorOffset() - before)).toBeLessThanOrEqual(2);
  await students[0]!.goto(exercise());
  watches[0] = await teacher.newPage(); await watches[0]!.goto(live(0)); await ready(watches[0]!);
});

test('background watches remain current for five minutes', async () => {
  test.setTimeout(340_000);
  await students[0]!.bringToFront();
  // No teacher interaction while server-side leases keep these watches alive.
  for (let minute = 0; minute < 5; minute++) {
    await students[0]!.waitForTimeout(60_000);
    await edit(students[4]!, `# minute-${minute}\n`);
    await matches(watches[4]!, `# minute-${minute}\n`);
  }
  for (const watch of watches) { await watch.bringToFront(); await ready(watch); }
});

test('final release and immediate rejoin preserve exact student text', async () => {
  await watches[0]!.close();
  await edit(students[0]!, '# final 🎉\nprint(6)\n');
  watches[0] = await teacher.newPage(); await watches[0]!.goto(live(0)); await ready(watches[0]!);
  await matches(watches[0]!, '# final 🎉\nprint(6)\n');
  await expect.poll(async () => (await storedDraft(students[0]!))?.code).toBe('# final 🎉\nprint(6)\n');
  const saved = (await storedDraft(students[0]!))!;
  await students[0]!.reload();
  await matches(students[0]!, '# final 🎉\nprint(6)\n');
  await matches(watches[0]!, '# final 🎉\nprint(6)\n');
  const reloaded = (await storedDraft(students[0]!))!;
  expect(reloaded.code).toBe(saved.code);
  expect(Date.parse(reloaded.updatedAt)).toBeGreaterThanOrEqual(Date.parse(saved.updatedAt));
});

test('revoking one student leaves the other watches receiving changes', async ({ browser }) => {
  const context = await browser.newContext();
  const manager = await context.newPage();
  await signInAs({ page: manager, identifier: 'manager@cove.test', password: 'CoveDev123!' });
  const token = await accessToken(context);
  const invoke = (action: string, input: unknown) => manager.request.post(`http://localhost:4000/api/rpc/academyClasses/${action}`, {
    headers: { Authorization: `Bearer ${token}` }, data: { json: input },
  });
  const scope = { academyId: '20000000-0000-4000-8000-000000000001', classId };
  try {
    const removed = await invoke('removeStudent', { ...scope, membershipId: membership(4) });
    expect(removed.status(), await removed.text()).toBe(200);
    await expect(watches[4]!.getByRole('button', { name: /Read-only|읽기 전용/i })).toBeDisabled();
    await edit(students[1]!, '# unaffected-by-revocation\n');
    await matches(watches[1]!, '# unaffected-by-revocation\n');
  } finally {
    const restored = await invoke('addStudents', { ...scope, membershipIds: [membership(4)] });
    expect(restored.status(), await restored.text()).toBe(200);
    await context.close();
  }
});

test('duplicate help permissions and aggregate indicator change independently', async () => {
  const page = watches[0]!;
  duplicate = await teacher.newPage();
  await duplicate.goto(live(0)); await ready(duplicate);
  try {
    await help(page);
    const canonical = await text(students[0]!);
    await edit(duplicate, '# refused in the other tab\n');
    await matches(duplicate, canonical);
    await matches(students[0]!, canonical);
    await help(duplicate);
    await page.getByRole('button', { name: /Help \/ Edit code|편집/i }).click();
    await expect(students[0]!.getByText(/Teacher is helping|도와주고/)).toBeVisible();
    await duplicate.close();
    await expect(students[0]!.getByText(/Teacher is monitoring|모니터링 중/)).toBeVisible();
  } finally {
    if (!duplicate.isClosed()) await duplicate.close();
  }
});

async function codePoint(page: Page, lineNumber: number, column: number) {
  return page.evaluate(({ lineNumber, column }) => {
    const editor = (window as any).monaco.editor.getEditors()[0];
    const position = editor.getScrolledVisiblePosition({ lineNumber, column });
    const box = editor.getDomNode().getBoundingClientRect();
    return { x: box.left + position.left, y: box.top + position.top, height: position.height };
  }, { lineNumber, column });
}

test('code pointers and carets retain their anchors across unequal layouts', async () => {
  const student = students[0]!; const watch = watches[0]!;
  const studentViewport = student.viewportSize()!; const teacherViewport = watch.viewportSize()!;
  try {
    await student.setViewportSize({ width: 1500, height: 900 });
    await watch.setViewportSize({ width: 1100, height: 720 });
    await edit(student, '# pointer fixture\nprint("🎉 한국어")\n');
    await matches(watch, '# pointer fixture\nprint("🎉 한국어")\n');
    // Teacher awareness intentionally expires on the student's screen after
    // three idle seconds. Browser/driver latency must not turn this geometry
    // assertion into an accidental expiry test. Advance frames explicitly while
    // keeping this resize within the marker's lifetime.
    const now = new Date();
    await student.clock.install({ time: now });
    await student.clock.pauseAt(new Date(now.getTime() + 1_000));
    for (const [sender, receiver] of [[student, watch], [watch, student]] as const) {
      const point = await codePoint(sender, 2, 3);
      await sender.mouse.move(point.x + 1, point.y + point.height / 2);
      await expect.poll(async () => {
        await student.clock.runFor(16);
        return receiver.evaluate(() => document.querySelector('[data-testid="peer-pointer"]')?.getAttribute('data-peer-surface') ?? null);
      }).toBe('editor');
      await expect.poll(async () => {
        await student.clock.runFor(16);
        const expected = await codePoint(receiver, 2, 3);
        const arrow = await receiver.getByTestId('peer-pointer').boundingBox();
        return arrow ? Math.max(Math.abs(arrow.x + 4.5 * (20 / 24) - (expected.x + 1)), Math.abs(arrow.y + 2.5 * (20 / 24) - (expected.y + expected.height / 2))) : Infinity;
      }).toBeLessThanOrEqual(2);
      await sender.evaluate(() => {
        const editor = (window as any).monaco.editor.getEditors()[0];
        editor.focus(); editor.setPosition({ lineNumber: 2, column: 3 });
      });
      await expect.poll(async () => {
        await student.clock.runFor(16);
        return receiver.locator('.cove-peer-cursor').count();
      }).toBe(1);
    }
    // Resize either receiver while its peer's code anchor stays stationary.
    for (const receiver of [student, watch]) {
      const sender = receiver === student ? watch : student;
      const anchor = await codePoint(sender, 2, 3);
      await sender.mouse.move(anchor.x + 1, anchor.y + anchor.height / 2);
      await expect.poll(async () => {
        await student.clock.runFor(16);
        return receiver.evaluate(() => document.querySelector('[data-testid="peer-pointer"]')?.getAttribute('data-peer-surface') ?? null);
      }).toBe('editor');
      const before = await codePoint(receiver, 2, 3);
      const divider = await receiver.locator('.cursor-col-resize').first().boundingBox();
      await receiver.mouse.move(divider!.x + 2, divider!.y + 80);
      await receiver.mouse.down();
      await receiver.mouse.move(divider!.x + 42, divider!.y + 80, { steps: 5 });
      await receiver.mouse.up();
      await expect.poll(async () => Math.abs((await codePoint(receiver, 2, 3)).x - before.x)).toBeGreaterThan(5);
      await expect.poll(async () => {
        await student.clock.runFor(16);
        const expected = await codePoint(receiver, 2, 3);
        const arrow = await receiver.getByTestId('peer-pointer').boundingBox();
        return arrow ? Math.max(Math.abs(arrow.x + 4.5 * (20 / 24) - (expected.x + 1)), Math.abs(arrow.y + 2.5 * (20 / 24) - (expected.y + expected.height / 2))) : Infinity;
      }).toBeLessThanOrEqual(2);
      if (receiver === student) {
        // Geometry changes must not keep a stationary teacher marker alive.
        await student.clock.runFor(3_100);
        await expect(student.getByTestId('peer-pointer')).toHaveCount(0);
      }
    }
  } finally {
    await student.clock.resume();
    await student.setViewportSize(studentViewport);
    await watch.setViewportSize(teacherViewport);
  }
});

test('one student keeps editing while another watch opens reloads and closes', async () => {
  const student = students[0]!;
  const timer = await student.evaluate(() => {
    let sequence = 0;
    return window.setInterval(() => {
      (window as any).monaco.editor.getModels()[0].setValue(`# continuous-${++sequence}\n`);
    }, 250);
  });
  let other: Page | undefined;
  try {
    other = await teacher.newPage();
    await other.goto(live(1)); await ready(other);
    await other.reload(); await ready(other);
    await other.close();
  } finally {
    await student.evaluate(timer => window.clearInterval(timer), timer);
    if (other && !other.isClosed()) await other.close();
  }
  const final = await text(student);
  expect(final).toMatch(/^# continuous-\d+\n$/);
  await matches(watches[0]!, final);
  await ready(watches[1]!);
});

if (studentCount > 5) {
  test('larger class keeps isolated streams through tab churn and lease renewal', async () => {
    test.setTimeout(240_000);
    await watches[studentCount - 1]!.close();
    await edit(students[0]!, '# first survives last closing\n');
    await matches(watches[0]!, '# first survives last closing\n');
    watches[studentCount - 1] = await teacher.newPage();
    await watches[studentCount - 1]!.goto(live(studentCount - 1));
    await ready(watches[studentCount - 1]!);
    await watches[Math.floor(studentCount / 2)]!.reload();
    await ready(watches[Math.floor(studentCount / 2)]!);
    // Longer than the 90-second watch lease, without touching teacher tabs.
    const started = Date.now();
    for (let round = 0; round < 5; round++) {
      await students[0]!.waitForTimeout(20_000);
      for (let i = 0; i < studentCount; i++) {
        await edit(students[i]!, `# student-${i} round-${round} 🎉\n`);
      }
      for (let i = 0; i < studentCount; i++) {
        await matches(watches[i]!, `# student-${i} round-${round} 🎉\n`);
      }
    }
    expect(Date.now() - started).toBeGreaterThan(90_000);
    for (const watch of watches) await ready(watch);
  });
  test('larger class receives simultaneous incremental typing from every student', async ({}, info) => {
    const timers: number[] = [];
    const prefixes = students.map((_, i) => `# concurrent student-${i}\n# `);
    for (let i = 0; i < studentCount; i++) await edit(students[i]!, prefixes[i]!);
    try {
      // Start and stop together: slow page preparation must not accidentally
      // leave the first student's timer running for minutes before the last starts.
      await Promise.all(students.map(async (page, i) => {
        timers[i] = await page.evaluate(() => window.setInterval(() => {
          const model = (window as any).monaco.editor.getModels()[0];
          const line = model.getLineCount();
          const column = model.getLineMaxColumn(line);
          model.applyEdits([{ range: { startLineNumber: line, endLineNumber: line,
            startColumn: column, endColumn: column }, text: 'x' }]);
        }, 250));
      }));
      await students[0]!.waitForTimeout(15_000);
    } finally {
      await Promise.all(students.map((page, i) => page.evaluate(timer => {
        if (timer !== undefined) window.clearInterval(timer);
      }, timers[i])));
    }
    const settled = Date.now();
    const inserted: number[] = [];
    for (let i = 0; i < studentCount; i++) {
      const value = await text(students[i]!);
      expect(value.startsWith(prefixes[i]!)).toBe(true);
      const suffix = value.slice(prefixes[i]!.length);
      expect(suffix).toMatch(/^x{10,}$/);
      inserted.push(suffix.length);
      await matches(watches[i]!, value);
    }
    await info.attach('simultaneous-typing', { body: JSON.stringify({ students: studentCount,
      incrementalEditsPerStudent: inserted, finalComparisonMs: Date.now() - settled }),
      contentType: 'application/json' });
    for (let i = 0; i < studentCount; i++) {
      const expected = await text(students[i]!);
      await expect.poll(async () => (await storedDraft(students[i]!))?.code, { timeout: 30_000 }).toBe(expected);
    }
  });

}
