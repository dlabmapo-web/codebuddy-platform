import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from '@playwright/test';
const origin = 'http://127.0.0.1:4420';
type Identity = {
  id: string;
  username: string;
  email: string;
  membershipId: string;
};
type Fixture = {
  id: string;
  academy: { id: string; slug: string };
  materialId: string;
  secondMaterialId?: string;
  courseId: string;
  classId: string;
  count: number;
  users: Record<string, Identity>;
};
async function fixture(
  request: APIRequestContext,
  input: object = {},
): Promise<Fixture> {
  const response = await request.post(origin + '/fixtures', { data: input });
  expect(response.ok()).toBe(true);
  return response.json();
}
async function inspect(request: APIRequestContext, f: Fixture) {
  return (await request.get(origin + '/fixtures/' + f.id)).json();
}
async function control(
  request: APIRequestContext,
  path: string,
  input: object = {},
) {
  const response = await request.post(origin + '/controls/' + path, {
    data: input,
  });
  expect(response.ok()).toBe(true);
}
async function login(page: Page, f: Fixture, user = 'student') {
  await page.goto('/login');
  const password = page.getByLabel(/^(Password|비밀번호)$/i, { exact: true });
  await expect(async () => {
    if ((await password.getAttribute('type')) !== 'text')
      await page
        .getByRole('button', { name: 'Show password', exact: true })
        .click();
    await expect(password).toHaveAttribute('type', 'text');
  }).toPass({ timeout: 15000 });
  await page
    .getByRole('button', { name: 'Hide password', exact: true })
    .click();
  await page.locator('input[name="identifier"]').fill(f.users[user]!.username);
  await password.fill('LocalLegacyTest123!');
  await page
    .getByRole('button', { name: /^(Log in|로그인|Sign in)$/i })
    .click();
  await expect(page).toHaveURL(new RegExp('/academy/' + f.academy.slug + '$'));
}
function url(f: Fixture, staff = false) {
  return (
    '/academy/' +
    f.academy.slug +
    '/learn/exercises/' +
    f.materialId +
    (staff ? '' : '?classId=' + f.classId)
  );
}
async function code(page: Page, value: string) {
  await expect(page.locator('.monaco-editor').first()).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate((value) => {
        const model = (
          window as unknown as {
            monaco?: {
              editor: { getModels(): { setValue(s: string): void }[] };
            };
          }
        ).monaco?.editor.getModels()[0];
        if (!model) return false;
        model.setValue(value);
        return true;
      }, value),
    )
    .toBe(true);
}
async function open(page: Page, f: Fixture, staff = false) {
  await page.goto(url(f, staff));
  await code(page, 'print(input())');
}
async function submit(page: Page) {
  const began = await page.evaluate(() => performance.now());
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  return began;
}
async function passed(page: Page, f: Fixture) {
  await expect(
    page.getByRole('heading', { name: 'Everything passed', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(`${f.count} / ${f.count}`, { exact: true }),
  ).toBeVisible();
}
async function token(page: Page) {
  const cookies = (await page.context().cookies())
    .filter((c) => /auth-token(?:\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  return JSON.parse(
    Buffer.from(
      cookies
        .map((c) => c.value)
        .join('')
        .replace(/^base64-/, ''),
      'base64url',
    ).toString(),
  ).access_token;
}
async function observeRawStream(
  page: Page,
  f: Fixture,
  kind: 'official' | 'practice',
  id: string,
) {
  await page.evaluate(
    ({ academyId, kind, id }) => {
      const target = window as unknown as {
        nativeRaw: { messages: string[]; errors: number };
      };
      const record = { messages: [] as string[], errors: 0 };
      target.nativeRaw = record;
      const source = new EventSource(
        `/api/learn/${kind === 'official' ? 'submissions' : 'practice-submissions'}/${id}/stream?academyId=${academyId}`,
      );
      source.addEventListener('result', (event) => {
        const text = (event as MessageEvent<string>).data;
        record.messages.push(text);
        const value = JSON.parse(text);
        if (!['QUEUED', 'RUNNING'].includes(value.status)) source.close();
      });
      source.onerror = () => {
        record.errors++;
      };
    },
    { academyId: f.academy.id, kind, id },
  );
}
async function rawMessages(page: Page) {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          nativeRaw: { messages: string[]; errors: number };
        }
      ).nativeRaw,
  );
}
async function rpc(page: Page, path: string, input: object) {
  return page.request.post('http://127.0.0.1:4419/api/rpc/' + path, {
    headers: { Authorization: 'Bearer ' + (await token(page)) },
    data: { json: input },
  });
}

test('real Pyodide Unicode ten-case result, first/repeat solve points and distinct actions', async ({
  page,
  request,
}) => {
  const f = await fixture(request, { cases: 10 });
  await login(page, f);
  await open(page, f);
  const streams: number[] = [];
  page.on('response', (r) => {
    if (r.url().includes('/stream')) streams.push(r.status());
  });
  const started = await submit(page);
  await passed(page, f);
  const elapsed = await page.evaluate(
    (start) => performance.now() - start,
    started,
  );
  const first = await inspect(request, f);
  expect(first.submissions).toHaveLength(1);
  expect(first.submissions[0]).toMatchObject({
    status: 'PASSED',
    gradingRevision: 1,
    executionRuntimeSnapshot: null,
    engineVersion: '0.27.5',
  });
  const publicResult = await rpc(page, 'learn/getSubmission', {
    academyId: f.academy.id,
    submissionId: first.submissions[0].id,
  });
  expect(publicResult.ok()).toBe(true);
  expect(await publicResult.text()).not.toContain('비공개');
  const visibleAt = await page.evaluate(() => Date.now());
  const timings = (
    await (await request.get(origin + '/timings')).json()
  ).filter((row: { jobId: string }) => row.jobId === first.submissions[0].id);
  const admission = timings.find(
    (row: { event: string }) => row.event === 'admission-ack',
  );
  const commit = timings.find(
    (row: { event: string }) => row.event === 'commit-ack',
  );
  expect(admission).toBeTruthy();
  expect(commit).toBeTruthy();
  const timingEvidence = {
    boundary: 'local diagnostic; not production acceptance',
    browserClickToVisibleMs: elapsed,
    handlerMs: admission.elapsedMs,
    acceptedToCommitAckMs: commit.at - admission.at,
    finalTransactionMs: commit.elapsedMs,
    commitAckToObservedVisibleMs: visibleAt - commit.at,
    acknowledgedTransactions: timings.filter(
      (row: { event: string }) => row.event === 'db-transaction-ack',
    ).length,
    db: await (await request.get(origin + '/diagnostics')).json(),
  };
  await test.info().attach('actual-boundaries.json', {
    body: Buffer.from(JSON.stringify(timingEvidence, null, 2)),
    contentType: 'application/json',
  });
  const solveAwards = first.points.filter(
    (p: { reason: string }) => p.reason === 'EXERCISE_SOLVED',
  );
  expect(solveAwards).toHaveLength(1);
  await submit(page);
  await passed(page, f);
  const second = await inspect(request, f);
  expect(second.submissions).toHaveLength(2);
  expect(second.submissions[0].admissionRequestId).not.toBe(
    second.submissions[1].admissionRequestId,
  );
  expect(
    second.points.filter(
      (p: { reason: string }) => p.reason === 'EXERCISE_SOLVED',
    ),
  ).toHaveLength(1);
  expect(streams).toContain(200);
  test.info().annotations.push({
    type: 'browser-clock-ms',
    description: String(elapsed),
  });
});
for (const [program, heading, item] of [
  ['print("wrong")', 'Check your output', 'Wrong output'],
  ['raise ValueError("boom")', 'Execution failed', 'Runtime error'],
  ['while True:\n    pass', 'Time limit exceeded', 'Time limit exceeded'],
] as const)
  test('visible real Python ' + item, async ({ page, request }) => {
    const f = await fixture(request);
    await login(page, f);
    await open(page, f);
    await code(page, program);
    await submit(page);
    await expect(
      page.getByRole('listitem', { name: new RegExp(item, 'i') }).first(),
    ).toBeVisible();
    const result = await inspect(request, f);
    expect(result.submissions).toHaveLength(1);
    expect(result.submissions[0].status).not.toBe('PASSED');
    expect(
      result.points.filter(
        (p: { reason: string }) => p.reason === 'EXERCISE_SOLVED',
      ),
    ).toHaveLength(0);
  });

test('staff practice visible result is owner scoped, hidden private and cannot award student points', async ({
  page,
  request,
  browser,
}) => {
  const f = await fixture(request);
  await login(page, f, 'staff');
  await open(page, f, true);
  await submit(page);
  await passed(page, f);
  const saved = await inspect(request, f);
  expect(saved.practice).toHaveLength(1);
  expect(saved.submissions).toHaveLength(0);
  expect(saved.points).toHaveLength(0);
  expect(saved.progress).toHaveLength(0);
  const id = saved.practice[0].id;
  const result = await rpc(page, 'learn/getPracticeResult', {
    academyId: f.academy.id,
    submissionId: id,
  });
  expect(result.ok()).toBe(true);
  expect(await result.text()).not.toContain('비공개');
  const context = await browser.newContext();
  const other = await context.newPage();
  await login(other, f, 'otherStaff');
  expect(
    (
      await rpc(other, 'learn/getPracticeResult', {
        academyId: f.academy.id,
        submissionId: id,
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await other.request.get(
        `/api/learn/practice-submissions/${id}/stream?academyId=${f.academy.id}`,
      )
    ).ok(),
  ).toBe(false);
  const separate = await fixture(request);
  expect(
    (
      await rpc(page, 'learn/getPracticeResult', {
        academyId: separate.academy.id,
        submissionId: id,
      })
    ).ok(),
  ).toBe(false);
  expect(
    (
      await request.post(origin + '/fixtures/' + f.id + '/membership', {
        data: { user: 'staff', status: 'INACTIVE' },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await rpc(page, 'learn/getPracticeResult', {
        academyId: f.academy.id,
        submissionId: id,
      })
    ).ok(),
  ).toBe(false);
  await context.close();
});

test('lost official admission acknowledgement retries the stable UUID and creates only one accepted attempt', async ({
  page,
  request,
}) => {
  const f = await fixture(request);
  await login(page, f);
  await open(page, f);
  const keys: string[] = [];
  let drop = true;
  await page.route('**/api/rpc/learn/submit', async (route) => {
    keys.push(route.request().postDataJSON().json.requestId);
    const response = await route.fetch();
    if (drop) {
      drop = false;
      await route.abort('connectionreset');
    } else await route.fulfill({ response });
  });
  await submit(page);
  await expect(
    page.getByRole('button', { name: 'Submit', exact: true }),
  ).toBeEnabled();
  await submit(page);
  await passed(page, f);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  expect((await inspect(request, f)).submissions).toHaveLength(1);
});

test('normal Submit observation reload preserves newer autosaved drafts pending and terminal, explicit history still reviews source', async ({
  page,
  request,
}) => {
  const f = await fixture(request);
  const sourceA = 'print(input())';
  const draftB = '# newer saved draft B\nprint(input())';
  await login(page, f);
  await open(page, f);
  let admissions = 0;
  page.on('request', r => { if (r.url().endsWith('/api/rpc/learn/submit')) admissions++; });
  await control(request, 'queue', { pause: true });
  const editorCode = () => page.evaluate(() => (window as unknown as {
    monaco: { editor: { getModels(): { getValue(): string }[] } };
  }).monaco?.editor.getModels()[0]?.getValue());
  try {
    await submit(page);
    await expect.poll(async () => (await inspect(request, f)).submissions.length).toBe(1);
    const pending = (await inspect(request, f)).submissions[0];
    expect(pending.status).toBe('QUEUED');
    // Test the actual normal-Submit URL rather than constructing recovery state.
    await code(page, draftB);
    await expect.poll(async () => (await inspect(request, f)).drafts[0]?.code).toBe(draftB);
    const acceptedUrl = page.url();
    await page.reload();
    await expect.poll(editorCode).toBe(draftB);
    await expect(page.getByRole('button', { name: 'Submit', exact: true })).toBeDisabled();
    expect((await inspect(request, f)).drafts[0].code).toBe(draftB);
    await control(request, 'queue', { pause: false });
    await passed(page, f);
    await page.reload();
    await passed(page, f);
    await expect.poll(editorCode).toBe(draftB);
    expect((await inspect(request, f)).drafts[0].code).toBe(draftB);
    expect(new URL(acceptedUrl).searchParams.get('observeSubmission')).toBe(pending.id);
    expect(new URL(acceptedUrl).searchParams.has('submission')).toBe(false);
    // Answer-record links deliberately keep the historical-source query contract.
    await page.goto('/academy/' + f.academy.slug + '/learn/records');
    const historyLink = page.locator('a[href*="submission=' + pending.id + '"]').first();
    await expect(historyLink).toBeVisible();
    await historyLink.click();
    await passed(page, f);
    await expect.poll(editorCode).toBe(sourceA);
    await page.goto(acceptedUrl);
    await expect.poll(editorCode).toBe(draftB);
    const saved = await inspect(request, f);
    expect(saved.drafts[0].code).toBe(draftB);
    expect(saved.submissions).toHaveLength(1);
    expect(saved.submissions[0].id).toBe(pending.id);
    expect(admissions).toBe(1);
    // A disconnected autosave leaves a newer owned local draft. Observation
    // must still run ordinary local recovery, including after terminal result.
    await page.context().route('**/api/rpc/learn/saveDraft', route => route.abort());
    await page.context().route('**/api/learn/draft-beacon', route => route.abort());
    // A page-scoped route can miss a keepalive beacon after document teardown.
    // Model an explicit failed transport in both documents; the real hook's
    // sendBeacon(false) fallback still calls ordinary sync, aborted above.
    const failBeaconTransport = () => {
      Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: () => false });
    };
    await page.addInitScript(failBeaconTransport);
    await page.evaluate(failBeaconTransport);
    const localC = '# newer local draft C\nprint(input())';
    await code(page, localC);
    await expect.poll(() => page.evaluate(({ userId, academyId, materialId }) => new Promise<string | null>(resolve => {
      const request = indexedDB.open('cove-learn', 1);
      request.onsuccess = () => {
        const db = request.result;
        const read = db.transaction('drafts', 'readonly').objectStore('drafts').get(`${userId}:${academyId}:${materialId}`);
        read.onsuccess = () => { resolve(read.result?.code ?? null); db.close(); };
        read.onerror = () => { resolve(null); db.close(); };
      };
      request.onerror = () => resolve(null);
    }), { userId: f.users.student!.id, academyId: f.academy.id, materialId: f.materialId })).toBe(localC);
    expect((await inspect(request, f)).drafts[0].code).toBe(draftB);
    await page.reload();
    await passed(page, f);
    await expect.poll(editorCode).toBe(localC);
    expect((await inspect(request, f)).drafts[0].code).toBe(draftB);
    expect(admissions).toBe(1);
  } finally {
    await control(request, 'queue', { pause: false });
  }
});

for (const kind of ['official', 'practice'] as const)
  test(
    kind +
      ' retained completion before first XREAD is delivered through Nest/Next/browser',
    async ({ page, request }) => {
      const f = await fixture(request);
      await login(page, f, kind === 'official' ? 'student' : 'staff');
      await open(page, f, kind === 'practice');
      await control(request, 'queue', { pause: true });
      await control(request, 'events', { pause: true });
      try {
        await submit(page);
        await expect
          .poll(
            async () =>
              (await (await request.get(origin + '/health')).json())
                .waitingReaders,
          )
          .toBeGreaterThan(0);
        await control(request, 'queue', { pause: false });
        await expect
          .poll(async () => {
            const saved = await inspect(request, f);
            return (kind === 'official' ? saved.submissions : saved.practice)[0]
              ?.status;
          })
          .toBe('PASSED');
        await expect(
          page.getByRole('heading', { name: 'Everything passed', exact: true }),
        ).toHaveCount(0);
        expect(
          (await (await request.get(origin + '/health')).json()).eventReads,
        ).toHaveLength(0);
        const release = Date.now();
        await control(request, 'events', { pause: false });
        await passed(page, f);
        expect(Date.now() - release).toBeLessThan(14000);
        const reads = (await (await request.get(origin + '/health')).json())
          .eventReads;
        expect(
          reads.some((read: { cursor: string }) => read.cursor === '0-0'),
        ).toBe(true);
      } finally {
        await control(request, 'events', { pause: false });
        await control(request, 'queue', { pause: false });
      }
    },
  );

for (const kind of ['official', 'practice'] as const)
  test(
    kind +
      ' replays an old same-ID failed queue event while retry is pending, then shows current saved result',
    async ({ page, request }) => {
      const f = await fixture(request, { timeLimitMs: 2000 });
      await login(page, f, kind === 'official' ? 'student' : 'staff');
      await open(page, f, kind === 'practice');
      await control(request, 'queue', { pause: true });
      await control(request, 'events', { pause: true });
      try {
        await submit(page);
        await expect
          .poll(async () => {
            const saved = await inspect(request, f);
            return (kind === 'official' ? saved.submissions : saved.practice)
              .length;
          })
          .toBe(1);
        const pending = await inspect(request, f),
          attemptId = (
            kind === 'official' ? pending.submissions : pending.practice
          )[0].id;
        await control(request, 'failure', { kind, id: attemptId });
        await control(request, 'queue', { pause: false });
        await expect
          .poll(async () => {
            const rows = await inspect(request, f);
            return (kind === 'official' ? rows.submissions : rows.practice)[0]
              ?.status;
          })
          .toBe('RUNNING');
        const saved = await inspect(request, f),
          id = (kind === 'official' ? saved.submissions : saved.practice)[0].id;
        await expect
          .poll(async () => {
            const history = JSON.stringify(
              await (
                await request.get(origin + '/controls/queue-history')
              ).json(),
            );
            return history.includes(id) && history.includes('failed');
          })
          .toBe(true);
        await expect
          .poll(
            async () =>
              (
                await (
                  await request.get(
                    origin + '/controls/job?kind=' + kind + '&id=' + id,
                  )
                ).json()
              ).state,
          )
          .toBe('failed');
        await control(request, 'retry', { kind, id });
        await expect
          .poll(
            async () =>
              (
                await (
                  await request.get(
                    origin + '/controls/job?kind=' + kind + '&id=' + id,
                  )
                ).json()
              ).state,
          )
          .toBe('active');
        await observeRawStream(page, f, kind, id);
        await expect
          .poll(async () =>
            (await rawMessages(page)).messages.some(
              (text) => JSON.parse(text).status === 'RUNNING',
            ),
          )
          .toBe(true);
        await expect
          .poll(
            async () =>
              (await (await request.get(origin + '/health')).json())
                .waitingReaders,
          )
          .toBeGreaterThan(0);
        await control(request, 'events', { pause: false });
        await page.waitForTimeout(500);
        expect((await rawMessages(page)).errors).toBe(0);
        await expect(
          page.getByRole('button', { name: 'Submit', exact: true }),
        ).toBeDisabled();
        await expect(
          page.getByText('private injected queue transport failure'),
        ).toHaveCount(0);
        await expect(
          page.getByRole('heading', { name: 'Everything passed', exact: true }),
        ).toHaveCount(0);
        await control(request, 'release', { kind });
        await passed(page, f);
        await expect
          .poll(async () =>
            (await rawMessages(page)).messages.some(
              (text) => JSON.parse(text).status === 'PASSED',
            ),
          )
          .toBe(true);
        expect(JSON.stringify(await rawMessages(page))).not.toContain(
          'private injected',
        );
        expect(
          kind === 'official'
            ? (await inspect(request, f)).submissions
            : (await inspect(request, f)).practice,
        ).toHaveLength(1);
      } finally {
        await control(request, 'events', { pause: false });
        await control(request, 'release', { kind });
        await control(request, 'queue', { pause: false });
      }
    },
  );

test('frozen revision and weighted prompt-ignore Unicode comparisons survive a material edit after acceptance', async ({
  page,
  request,
}) => {
  const f = await fixture(request, { enhanced: true, ignorePrompts: true });
  await login(page, f);
  await open(page, f);
  await code(page, 'print(input("prompt> "))');
  await control(request, 'queue', { pause: true });
  try {
    await submit(page);
    await expect
      .poll(async () => (await inspect(request, f)).submissions.length)
      .toBe(1);
    await request.post(origin + '/fixtures/' + f.id + '/revision', {
      data: {},
    });
    await control(request, 'queue', { pause: false });
    await passed(page, f);
    const saved = await inspect(request, f);
    expect(saved.submissions[0]).toMatchObject({
      gradingRevision: 1,
      status: 'PASSED',
      score: 100,
      earnedWeight: 3,
      possibleWeight: 3,
    });
    // Revision two changes only the weight-two hidden answer. Equal weighting
    // would produce 50; the real weighted result must be exactly 33 (1/3).
    await submit(page);
    await expect(
      page.getByRole('heading', { name: 'Check your output', exact: true }),
    ).toBeVisible();
    const partial = (await inspect(request, f)).submissions.find(
      (row: { gradingRevision: number }) => row.gradingRevision === 2,
    );
    expect(partial).toMatchObject({
      status: 'FAILED',
      score: 33,
      passedCount: 1,
      totalCount: 2,
      earnedWeight: 1,
      possibleWeight: 3,
    });
    const publicPartial = await rpc(page, 'learn/getSubmission', {
      academyId: f.academy.id,
      submissionId: partial.id,
    });
    expect(publicPartial.ok()).toBe(true);
    expect((await publicPartial.json()).json).toMatchObject({
      score: 33,
      earnedWeight: 1,
      possibleWeight: 3,
    });
  } finally {
    await control(request, 'queue', { pause: false });
  }
});

for (const kind of ['official', 'practice'] as const)
  test(
    kind +
      ' completed-before-connect and disconnected stream recover the saved verdict',
    async ({ page, request }) => {
      const f = await fixture(request, { timeLimitMs: 2000 });
      await login(page, f, kind === 'official' ? 'student' : 'staff');
      await open(page, f, kind === 'practice');
      let dropped = true,
        connections = 0;
      await page.route(
        '**/api/learn/*submissions/*/stream?**',
        async (route) => {
          connections++;
          if (dropped) {
            dropped = false;
            await route.abort('connectionreset');
            return;
          }
          await expect
            .poll(async () => {
              const saved = await inspect(request, f);
              return (
                kind === 'official' ? saved.submissions : saved.practice
              )[0]?.status;
            })
            .toBe('PASSED');
          await route.continue();
        },
      );
      await submit(page);
      await passed(page, f);
      expect(connections).toBeGreaterThan(0);
      const saved = await inspect(request, f);
      expect(
        kind === 'official' ? saved.submissions : saved.practice,
      ).toHaveLength(1);
      const id = (kind === 'official' ? saved.submissions : saved.practice)[0]
        .id;
      await observeRawStream(page, f, kind, id);
      await expect
        .poll(async () =>
          (await rawMessages(page)).messages.some(
            (text) => JSON.parse(text).status === 'PASSED',
          ),
        )
        .toBe(true);
      expect((await rawMessages(page)).errors).toBe(0);
      expect(JSON.stringify(await rawMessages(page))).not.toContain('비공개');
    },
  );

test('buffered official SSE uses its saved-result fallback without another admission', async ({
  page,
  request,
}) => {
  const f = await fixture(request);
  await login(page, f);
  await open(page, f);
  await page.route('**/api/learn/submissions/*/stream?**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: ': buffered transport\n\n',
    }),
  );
  await submit(page);
  await passed(page, f);
  expect((await inspect(request, f)).submissions).toHaveLength(1);
});

test('practice membership revoked between stream attachment and commit receives no private result', async ({
  page,
  request,
}) => {
  const f = await fixture(request);
  await login(page, f, 'staff');
  await open(page, f, true);
  await control(request, 'queue', { pause: true });
  try {
    await submit(page);
    await expect
      .poll(async () => (await inspect(request, f)).practice.length)
      .toBe(1);
    expect(
      (
        await request.post(origin + '/fixtures/' + f.id + '/membership', {
          data: { user: 'staff', status: 'INACTIVE' },
        })
      ).ok(),
    ).toBe(true);
    await control(request, 'queue', { pause: false });
    await expect
      .poll(async () => (await inspect(request, f)).practice[0].status)
      .toBe('PASSED');
    await page.waitForTimeout(1000);
    await expect(
      page.getByRole('heading', { name: 'Everything passed', exact: true }),
    ).toHaveCount(0);
    const id = (await inspect(request, f)).practice[0].id;
    expect(
      (
        await page.request.get(
          `/api/learn/practice-submissions/${id}/stream?academyId=${f.academy.id}`,
        )
      ).ok(),
    ).toBe(false);
  } finally {
    await control(request, 'queue', { pause: false });
  }
});

test('navigation while an accepted official action is pending never paints its result in another exercise', async ({
  page,
  request,
}) => {
  const f = await fixture(request, { secondMaterial: true });
  await login(page, f);
  await open(page, f);
  await control(request, 'queue', { pause: true });
  try {
    await submit(page);
    await expect
      .poll(async () => (await inspect(request, f)).submissions.length)
      .toBe(1);
    await page.goto(url({ ...f, materialId: f.secondMaterialId! }));
    await code(page, 'print(input())');
    await expect
      .poll(
        async () =>
          (await (await request.get(origin + '/health')).json())
            .streamListenerCount,
      )
      .toBe(0);
    await control(request, 'queue', { pause: false });
    await expect
      .poll(async () => (await inspect(request, f)).submissions[0].status)
      .toBe('PASSED');
    await expect(
      page.getByRole('heading', { name: 'Other exercise', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Everything passed', exact: true }),
    ).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get('submission')).toBeNull();
    expect(
      (await page.request.get('http://127.0.0.1:4419/api/health')).status(),
    ).toBe(200);
    expect(
      (
        await request.post(origin + '/controls/phase', {
          data: { phase: 'candidate' },
        })
      ).status(),
    ).toBe(403);
    expect((await page.request.get('/login')).ok()).toBe(true);
  } finally {
    await control(request, 'queue', { pause: false });
  }
});
