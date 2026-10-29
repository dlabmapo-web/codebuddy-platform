#!/usr/bin/env node
/** Runs workloads only against an explicitly owned, preprovisioned isolated
 * Linux AMD64 stack. No install/start/activation/deploy/sign/push operation. */
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, dirname, isAbsolute } from 'node:path';
import { cpus, platform, arch, release } from 'node:os';
import { chromium } from '@playwright/test';
import {
  bindAcceptanceAuthority,
  acceptedRuntimeEvidence,
  inspectBrokerArtifact,
} from './native-grading-acceptance-authority.mjs';
import { acknowledgedTimings } from '../packages/api/scripts/native-grading-e2e-timings.mjs';
import {
  summarize,
  assertContinuity,
  assertObservationContinuity,
} from './native-grading-acceptance-statistics.mjs';
const [configPath, outputPath] = process.argv.slice(2);
if (!configPath || !outputPath)
  throw new Error(
    'Usage: node e2e/native-grading-acceptance.mjs CONFIG_JSON NEW_OUTPUT_DIRECTORY',
  );
const output = resolve(outputPath);
await mkdir(dirname(output), { recursive: true });
await mkdir(output, { recursive: false });
const write = (name, value) =>
  writeFile(resolve(output, name), JSON.stringify(value, null, 2) + '\n');
if (platform() !== 'linux' || arch() !== 'x64') {
  await write('status.json', {
    status: 'unsupported',
    reason: 'Linux AMD64 required',
    platform: platform(),
    architecture: arch(),
    executed: false,
  });
  process.exit(2);
}
const continuityClock = { wall: Date.now(), monotonic: performance.now() };
const config = JSON.parse(await readFile(configPath, 'utf8'));
if (
  config.version !== 1 ||
  config.isolated !== true ||
  !['baseline', 'candidate'].includes(config.phase) ||
  !/^[a-z0-9-]{8,80}$/.test(config.fixtureId)
)
  throw new Error('Explicit isolated phase/owned fixture identity required');
for (const key of ['apiOrigin', 'webOrigin', 'fixtureOrigin', 'workerOrigin']) {
  const url = new URL(config[key]);
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    url.pathname !== '/'
  )
    throw new Error('Loopback origin required: ' + key);
}
// Rendering/reference work must stay on the artifact-bound isolated web app.
if (
  new URL(config.drawing.url).origin !== new URL(config.webOrigin).origin ||
  typeof config.referencePath !== 'string' ||
  !config.referencePath.startsWith('/') ||
  config.referencePath.startsWith('//')
)
  throw new Error(
    'Drawing/reference targets must stay on the isolated web origin',
  );
const get = async (path) => {
  const response = await fetch(config.fixtureOrigin + path, {
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Fixture HTTP ' + response.status);
  return response.json();
};
const post = async (path, value) => {
  const response = await fetch(config.fixtureOrigin + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error('Fixture HTTP ' + response.status);
  return response.json();
};
const health = await get('/health');
if (health.fixtureId !== config.fixtureId)
  throw new Error('Wrong fixture server; no workload sent');
const host = () =>
  JSON.parse(
    execFileSync(
      'python3',
      ['deploy/scripts/grading/host.py', config.hostConfig],
      { encoding: 'utf8', timeout: 30000, maxBuffer: 2 ** 20 },
    ),
  );
const before = host();
if (before.architecture !== 'amd64' || !before.rootless)
  throw new Error('Verified AMD64 rootless host required');
await write('host-before.json', before);
const hostConfig = JSON.parse(await readFile(config.hostConfig, 'utf8'));
const images = [];
for (const artifact of config.artifacts) {
  if (!isAbsolute(artifact.daemonSocket))
    throw new Error('Local Unix daemon socket required');
  if (
    !/^sha256:[a-f0-9]{64}$/.test(artifact.configId) ||
    !/^.+@sha256:[a-f0-9]{64}$/.test(artifact.reference)
  )
    throw new Error(
      'Prebuilt immutable pull reference + actual config ID required',
    );
  const actual = JSON.parse(
    execFileSync(
      'docker',
      [
        '--host',
        'unix://' + artifact.daemonSocket,
        'image',
        'inspect',
        artifact.reference,
        '--format',
        '{{json .}}',
      ],
      { encoding: 'utf8', timeout: 15000 },
    ),
  );
  if (actual.Id !== artifact.configId || actual.Architecture !== 'amd64')
    throw new Error('Test artifact mismatch');
  images.push({
    role: artifact.role,
    reference: artifact.reference,
    configId: actual.Id,
    architecture: actual.Architecture,
    sourceRevision:
      actual.Config.Labels?.['org.opencontainers.image.revision'] ?? null,
  });
}
if (
  !['api', 'worker', 'web', 'broker', 'native', 'compatibility'].every((role) =>
    images.some((image) => image.role === role),
  )
)
  throw new Error('Complete tested artifact inventory required');
// Bind the listener to the inspected app container, not an unrelated dev server.
for (const [role, origin] of [
  ['api', config.apiOrigin],
  ['worker', config.workerOrigin],
  ['web', config.webOrigin],
]) {
  const expected = config.artifacts.find((image) => image.role === role);
  const actual = JSON.parse(
    execFileSync(
      'docker',
      [
        '--host',
        'unix://' + expected.daemonSocket,
        'inspect',
        expected.containerId,
      ],
      { encoding: 'utf8', timeout: 15000 },
    ),
  )[0];
  if (
    !actual.State.Running ||
    actual.Image !== expected.configId ||
    actual.HostConfig.NetworkMode !== 'host'
  )
    throw new Error(
      'Acceptance app must use the exact running host-network artifact',
    );
  if (role === 'api' || role === 'worker') {
    const names =
      role === 'api'
        ? ['env', 'server', 'seed', 'timings', 'phase']
        : ['env', 'worker', 'timings'];
    for (const name of names) {
      const script = 'native-grading-e2e-' + name + '.mjs',
        wanted = createHash('sha256')
          .update(await readFile('packages/api/scripts/' + script))
          .digest('hex');
      const actualScript = JSON.parse(
        execFileSync(
          'docker',
          [
            '--host',
            'unix://' + expected.daemonSocket,
            'exec',
            expected.containerId,
            'node',
            '--input-type=module',
            '-e',
            `import {readFileSync,statSync} from 'node:fs';import{createHash}from'node:crypto';const p='/app/scripts/'+process.argv[1],s=statSync(p);console.log(JSON.stringify({uid:process.getuid(),owner:s.uid,mode:s.mode&511,sha256:createHash('sha256').update(readFileSync(p)).digest('hex')}));`,
            script,
          ],
          { encoding: 'utf8', timeout: 15000 },
        ),
      );
      if (
        actualScript.uid !== 1001 ||
        actualScript.owner !== 0 ||
        actualScript.mode & 0o022 ||
        actualScript.sha256 !== wanted
      )
        throw new Error(
          'Trusted fixture bytes/ownership differ from measured harness',
        );
    }
  }
  const port = Number(new URL(origin).port)
    .toString(16)
    .toUpperCase()
    .padStart(4, '0');
  const tcp = (await readFile('/proc/net/tcp', 'utf8'))
    .split('\n')
    .map((line) => line.trim().split(/\s+/));
  const inodes = tcp
    .filter((row) => row[1] === '0100007F:' + port && row[3] === '0A')
    .map((row) => row[9]);
  const { readdir, readlink } = await import('node:fs/promises');
  const ownedPids = new Set(),
    pendingPids = [actual.State.Pid],
    sockets = [];
  while (pendingPids.length) {
    const pid = pendingPids.shift();
    if (ownedPids.has(pid)) continue;
    ownedPids.add(pid);
    if (ownedPids.size > 256)
      throw new Error('Unbounded tested app process tree');
    const children = (
      await readFile(`/proc/${pid}/task/${pid}/children`, 'utf8')
    ).trim();
    if (children)
      for (const child of children.split(/\s+/)) {
        if (!/^\d+$/.test(child)) throw new Error('Invalid process census');
        pendingPids.push(Number(child));
      }
    const descriptors = await readdir(`/proc/${pid}/fd`);
    sockets.push(
      ...(await Promise.all(
        descriptors.map((fd) =>
          readlink(`/proc/${pid}/fd/${fd}`).catch(() => ''),
        ),
      )),
    );
  }
  if (!inodes.some((inode) => sockets.includes('socket:[' + inode + ']')))
    throw new Error(
      'Loopback listener does not belong to tested artifact process tree: ' +
        role,
    );
}
const authority = bindAcceptanceAuthority(
  config,
  hostConfig,
  JSON.parse(await readFile(hostConfig.manifestPath, 'utf8')),
  await get('/authority'),
  inspectBrokerArtifact(
    config.artifacts.find((a) => a.role === 'broker'),
    config.fixtureId,
    hostConfig.brokerEntrypoint,
  ),
);
await write('runtime-authority.json', authority);
const clock = [];
for (let i = 0; i < 10; i++) {
  const began = Date.now(),
    sample = await get('/health'),
    end = Date.now();
  clock.push({
    requestAt: began,
    responseAt: end,
    serverNow: sample.now,
    offsetMinimumMs: sample.now - end,
    offsetMaximumMs: sample.now - began,
  });
}
if (
  clock.some(
    (sample, index) =>
      sample.serverNow < clock[Math.max(0, index - 1)].serverNow,
  )
)
  throw new Error('Server clock continuity lost');
await write('artifacts.json', images);
const harnessFiles = [
  'e2e/native-grading-acceptance.mjs',
  'e2e/native-grading-acceptance-statistics.mjs',
  'e2e/native-grading-acceptance-authority.mjs',
  'e2e/native-grading-broker-tree.py',
  ...['env', 'server', 'seed', 'worker', 'timings', 'phase'].map(
    (name) => 'packages/api/scripts/native-grading-e2e-' + name + '.mjs',
  ),
];
await write(
  'harness-hashes.json',
  await Promise.all(
    harnessFiles.map(async (path) => ({
      path,
      sha256: createHash('sha256')
        .update(await readFile(path))
        .digest('hex'),
    })),
  ),
);
await write('placement.json', {
  ...config.placement,
  kernel: release(),
  logicalCpus: cpus().length,
  db: await get('/diagnostics'),
  profile: config.profile,
  clock,
});
const observation = async () =>
  JSON.parse(await readFile(hostConfig.observationsPath, 'utf8'));
const observationBefore = await observation();
assertObservationContinuity(observationBefore, observationBefore);
await write('observations-before.json', observationBefore);
await post('/controls/phase', { phase: config.phase });
const rows = [],
  fixtures = new Map();
const rpc = async (token, path, input) => {
  const response = await fetch(config.apiOrigin + '/api/rpc/' + path, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ json: input }),
    signal: AbortSignal.timeout(30000),
  });
  const value = await response.json();
  if (!response.ok) throw new Error('RPC ' + path + ' ' + response.status);
  return value.json;
};
const authenticate = async (user) => {
  const response = await fetch(
    config.fixtureOrigin + '/auth/v1/token?grant_type=password',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: user.email,
        password: 'LocalLegacyTest123!',
      }),
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok) throw new Error('Synthetic login failed');
  return (await response.json()).access_token;
};
async function prepare(entry) {
  const fixture = await post('/fixtures', {
    cases: entry.cases,
    enhanced: true,
    ...entry.fixtureInput,
  });
  fixtures.set(entry.key, {
    fixture,
    token: await authenticate(fixture.users.student),
    staffToken: await authenticate(fixture.users.staff),
  });
}
async function submission(entry, cohort) {
  const { fixture, token } = fixtures.get(entry.key);
  const began = performance.now(),
    wall = Date.now();
  let id;
  const row = {
    phase: config.phase,
    cohort,
    cases: entry.cases,
    fixtureKey: entry.key,
    startedAt: wall,
  };
  try {
    const accepted = await rpc(token, 'learn/submit', {
      academyId: fixture.academy.id,
      classId: fixture.classId,
      materialId: fixture.materialId,
      code: 'print(input())',
      requestId: randomUUID(),
    });
    id = accepted.submissionId;
    row.admissionMs = performance.now() - began;
    const deadline = performance.now() + 180000;
    let saved;
    do {
      const state = await get('/fixtures/' + fixture.id);
      saved = state.submissions.find((item) => item.id === id);
      if (saved && !['QUEUED', 'RUNNING'].includes(saved.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    } while (performance.now() < deadline);
    if (
      !saved ||
      saved.status !== 'PASSED' ||
      saved.passedCount !== entry.cases
    )
      throw new Error('Unexpected/unfinished verdict');
    const savedObservedAt = Date.now(),
      savedObservedMonotonicMs = performance.now();
    row.runtimeEvidence = acceptedRuntimeEvidence(
      saved,
      config.phase,
      authority,
      config.baselineProvenance,
    );
    let boundaries;
    const timingDeadline = performance.now() + 5000;
    do {
      try {
        boundaries = acknowledgedTimings(await get('/timings?jobId=' + id), id);
        break;
      } catch (error) {
        if (performance.now() >= timingDeadline) throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    } while (true);
    const { commit, admission, rows: timings } = boundaries;
    if (admission.at < wall - 1000)
      throw new Error('Invalid admission clock boundary');
    row.acceptedToCommitAckMs = commit.at - admission.at;
    row.handlerMs = admission.elapsedMs;
    row.finalTransactionMs = commit.elapsedMs;
    row.commitPostAckObservationMs = commit.postCommitObservationMs;
    row.commitSpanIncludingDiagnosticsMs = commit.spanElapsedMs;
    row.savedObservedAt = savedObservedAt;
    row.savedReadRelativeToCommitAckMs = savedObservedAt - commit.at;
    row.observedSavedMs = savedObservedMonotonicMs - began;
    row.diagnosticCollectionMs = performance.now() - savedObservedMonotonicMs;
    row.runtimeMs = saved.runtimeMs;
    row.acknowledgedTransactionCount = timings.filter(
      (item) => item.event === 'db-transaction-ack',
    ).length;
    row.stages = timings;
    const state = await get('/fixtures/' + fixture.id);
    const solves = state.points.filter(
      (point) =>
        point.reason === 'EXERCISE_SOLVED' &&
        point.membershipId === fixture.users.student.membershipId &&
        point.materialId === fixture.materialId,
    );
    if (solves.length !== 1)
      throw new Error('Incorrect first/repeat point awards');
  } catch (error) {
    row.error = error.message;
  } finally {
    row.totalObservedMs = performance.now() - began;
    rows.push(row);
    await appendFile(
      resolve(output, 'submissions.jsonl'),
      JSON.stringify(row) + '\n',
    );
  }
  return row;
}
if (
  !Array.isArray(config.cohorts) ||
  config.cohorts.length !== 300 ||
  new Set(config.cohorts.map((entry) => entry.key)).size !== 300
)
  throw new Error(
    'Exactly 100 unique fixtures for each 1/5/10-case cohort required',
  );
for (const count of [1, 5, 10])
  if (config.cohorts.filter((entry) => entry.cases === count).length !== 100)
    throw new Error('Missing 100-case cohort');
for (const entry of config.cohorts) await prepare(entry);
for (const count of [1, 5, 10])
  for (const solve of ['first', 'repeat'])
    for (const entry of config.cohorts.filter((entry) => entry.cases === count))
      await submission(entry, `sequential-${solve}`);
await Promise.all(
  config.cohorts.slice(0, 2).map((entry) => submission(entry, 'two-in-flight')),
);
await Promise.all(
  config.cohorts
    .slice(0, 10)
    .map((entry) => submission(entry, 'ten-client-burst')),
);
// Every mixed request is an authenticated normal application RPC, with its
// matching read contract. The fixture-only identities are selected by key.
if (
  !Array.isArray(config.mixedRequests) ||
  !['official', 'practice', 'sample', 'regrade'].every((kind) =>
    config.mixedRequests.some((row) => row.kind === kind),
  )
)
  throw new Error('All four mixed workloads required');
const browser = await chromium.launch({ headless: false });
try {
  const drawing = await browser.newPage();
  await drawing.goto(config.drawing.url);
  await drawing.evaluate((code) => {
    const model = window.monaco?.editor.getModels()[0];
    if (!model) throw new Error('Real Turtle editor unavailable');
    model.setValue(code);
  }, 'import turtle\nfor i in range(100000):\n    turtle.forward(2)\n    turtle.left(3)');
  await drawing.locator(config.drawing.runSelector).click();
  const drawingCanvas = config.drawing.frameSelector
    ? drawing
        .frameLocator(config.drawing.frameSelector)
        .locator(config.drawing.canvasSelector)
    : drawing.locator(config.drawing.canvasSelector);
  await drawingCanvas.waitFor();
  const initialDrawing = createHash('sha256')
    .update(await drawingCanvas.screenshot())
    .digest('hex');
  const reference = [];
  for (let windowIndex = 0; windowIndex < 2; windowIndex++) {
    const end = performance.now() + 60000;
    const mixed = config.mixedRequests.map(async (request) => {
      const identity = fixtures.get(request.fixtureKey),
        f = identity.fixture,
        samples = [];
      while (performance.now() < end) {
        const began = performance.now();
        try {
          if (request.kind === 'official') {
            const entry = config.cohorts.find(
              (row) => row.key === request.fixtureKey,
            );
            const result = await submission(entry, `mixed-${windowIndex}`);
            if (result.error) throw new Error(result.error);
          } else {
            let accepted, read, status;
            if (request.kind === 'practice') {
              accepted = await rpc(
                identity.staffToken,
                'learn/submitPractice',
                {
                  academyId: f.academy.id,
                  materialId: f.materialId,
                  code: 'print(input())',
                  requestId: randomUUID(),
                },
              );
              read = () =>
                rpc(identity.staffToken, 'learn/getPracticeResult', {
                  academyId: f.academy.id,
                  submissionId: accepted.submissionId,
                });
              status = 'PASSED';
            } else if (request.kind === 'sample') {
              accepted = await rpc(identity.token, 'learn/startSampleCheck', {
                academyId: f.academy.id,
                classId: f.classId,
                materialId: f.materialId,
                position: 1,
                workspaceRevision: 1,
                code: 'print(input())',
                clientRequestId: randomUUID(),
              });
              read = () =>
                rpc(identity.token, 'learn/getSampleCheck', {
                  academyId: f.academy.id,
                  checkId: accepted.checkId,
                });
              status = 'COMPLETED';
            } else if (request.kind === 'regrade') {
              // Add an explicitly historical synthetic row; never rewrite an
              // accepted attempt's revision/descriptor just to generate load.
              await post('/fixtures/' + f.id + '/regrade-source', {});
              const plan = await rpc(
                identity.staffToken,
                'platformOperations/planRegrade',
                { academyId: f.academy.id, materialId: f.materialId },
              );
              if (plan.plannedCount !== 1)
                throw new Error('Unexpected regrade plan');
              accepted = await rpc(
                identity.staffToken,
                'platformOperations/startRegrade',
                { runId: plan.runId },
              );
              read = () =>
                rpc(identity.staffToken, 'platformOperations/run', {
                  runId: accepted.id,
                });
              status = 'COMPLETED';
            } else throw new Error('Unknown mixed kind');
            let result;
            const deadline = performance.now() + 180000;
            do {
              result = await read();
              if (!['QUEUED', 'RUNNING', 'STOPPING'].includes(result.status))
                break;
              await new Promise((resolve) => setTimeout(resolve, 100));
            } while (performance.now() < deadline);
            if (result.status !== status)
              throw new Error('Unexpected mixed result ' + result.status);
          }
          samples.push({
            kind: request.kind,
            elapsedMs: performance.now() - began,
          });
        } catch (error) {
          samples.push({
            kind: request.kind,
            elapsedMs: performance.now() - began,
            error: error.message,
          });
          break;
        }
      }
      return { kind: request.kind, samples };
    });
    while (performance.now() < end) {
      const began = performance.now();
      try {
        const response = await fetch(config.webOrigin + config.referencePath, {
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error('reference HTTP ' + response.status);
        const frameMs = await drawing.evaluate(
          () =>
            new Promise((resolve) => {
              requestAnimationFrame((t) =>
                requestAnimationFrame((next) => resolve(next - t)),
              );
            }),
        );
        reference.push({
          window: windowIndex,
          elapsedMs: performance.now() - began,
          frameMs,
        });
      } catch (error) {
        reference.push({ window: windowIndex, error: error.message });
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    await write(`mixed-${windowIndex}.json`, await Promise.all(mixed));
  }
  const finalDrawing = createHash('sha256')
    .update(await drawingCanvas.screenshot())
    .digest('hex');
  if (initialDrawing === finalDrawing)
    throw new Error('No actual Turtle drawing advancement observed');
  await write('reference-reads.json', reference);
  // Distinct real visible browser boundary; same browser clock at click/render.
  const entry = config.cohorts[0],
    { fixture } = fixtures.get(entry.key),
    page = await browser.newPage();
  await page.goto(config.webOrigin + '/login');
  await page
    .getByRole('button', { name: 'Show password', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Hide password', exact: true })
    .click();
  await page
    .locator('input[name="identifier"]')
    .fill(fixture.users.student.username);
  await page.locator('input[type="password"]').fill('LocalLegacyTest123!');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForURL('**/academy/' + fixture.academy.slug);
  await page.goto(
    config.webOrigin +
      '/academy/' +
      fixture.academy.slug +
      '/learn/exercises/' +
      fixture.materialId +
      '?classId=' +
      fixture.classId,
  );
  await page.locator('.monaco-editor').waitFor();
  await page.evaluate(() =>
    window.monaco.editor.getModels()[0].setValue('print(input())'),
  );
  const start = await page.evaluate(() => ({
    monotonic: performance.now(),
    wall: Date.now(),
  }));
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await page
    .getByRole('heading', { name: 'Everything passed', exact: true })
    .waitFor({ timeout: 180000 });
  const finish = await page.evaluate(() => ({
    monotonic: performance.now(),
    wall: Date.now(),
  }));
  await write('browser-clock.json', {
    clickToVisibleMs: finish.monotonic - start.monotonic,
    start,
    finish,
  });
  await page.screenshot({ path: resolve(output, 'visible-result.png') });
} finally {
  await browser.close();
}
const endClock = { wall: Date.now(), monotonic: performance.now() };
await write('clock-continuity.json', {
  before: continuityClock,
  after: endClock,
  driftMs:
    endClock.wall -
    continuityClock.wall -
    (endClock.monotonic - continuityClock.monotonic),
});
if (
  Math.abs(
    endClock.wall -
      continuityClock.wall -
      (endClock.monotonic - continuityClock.monotonic),
  ) > 100
)
  throw new Error('Wall/monotonic clock continuity lost');
const after = host(),
  observationAfter = await observation();
const finalAuthority = bindAcceptanceAuthority(
  config,
  hostConfig,
  JSON.parse(await readFile(hostConfig.manifestPath, 'utf8')),
  await get('/authority'),
  {
    ...authority.brokerTrees,
    hostTreeIdentity: execFileSync(
      'python3',
      [
        'deploy/scripts/grading/artifact.py',
        dirname(dirname(hostConfig.brokerEntrypoint)),
      ],
      { encoding: 'utf8', timeout: 30000 },
    ).trim(),
  },
);
if (JSON.stringify(finalAuthority) !== JSON.stringify(authority))
  throw new Error('Runtime authority changed during measurement');
await write('host-after.json', after);
await write('observations-after.json', observationAfter);
assertContinuity(before, after);
assertObservationContinuity(observationBefore, observationAfter);
const cohorts = {};
for (const cases of [1, 5, 10])
  for (const solve of ['first', 'repeat']) {
    const selection = rows.filter(
      (row) => row.cases === cases && row.cohort === `sequential-${solve}`,
    );
    cohorts[`${cases}-${solve}`] = {
      commit: summarize(selection, 'acceptedToCommitAckMs'),
      admission: summarize(selection, 'admissionMs'),
    };
  }
await write('summary.json', {
  version: 1,
  phase: config.phase,
  executed: true,
  passed: false,
  reason:
    'Unsigned measurement only; compare paired evidence and complete all independent acceptance gates',
  cohorts,
  allFailures: rows.filter((row) => row.error),
  unrecordedRuntimeSamples: rows.filter(
    (row) => row.runtimeEvidence?.provenance === 'unrecorded',
  ).length,
  source: execFileSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8',
  }).trim(),
  configHash: createHash('sha256')
    .update(await readFile(configPath))
    .digest('hex'),
  hostIdentity: after.hostIdentity,
  configurationIdentity: after.configurationIdentity,
});
if (rows.some((row) => row.error)) process.exitCode = 1;
