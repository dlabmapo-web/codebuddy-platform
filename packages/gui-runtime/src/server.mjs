import { reapPrevious } from './reap-previous.mjs';
import { readFile } from 'node:fs/promises';
import { StandbyPool } from './standby-pool.mjs';
import { createSandboxDriver } from './sandbox.mjs';
import { Telemetry } from './telemetry.mjs';
import { validateWarmConfiguration } from './warm-config.mjs';
import { SessionScheduler } from './session-scheduler.mjs';
import { createServer } from "node:http";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { StringDecoder } from "node:string_decoder";
import { WebSocketServer } from "ws";
import { assertRootlessRuntime, equalSecret, validateRun, terminalParser } from "./policy.mjs";
import { runtimeImages, selectRuntimeImage } from "./runtime-images.mjs";
const exec = promisify(execFile);
const secret = process.env.GUI_SERVICE_SECRET;
if (!secret || secret.length < 32)
  throw new Error("GUI_SERVICE_SECRET must contain at least 32 characters");
const image = process.env.GUI_RUNTIME_IMAGE || "cove-gui-runtime:dev";
if (process.env.NODE_ENV === "production" && !image.includes("@sha256:"))
  throw new Error("Production GUI image must be pinned by digest");
const metricsSecret = process.env.GUI_METRICS_SECRET;
if (metricsSecret && (metricsSecret.length < 32 || equalSecret(metricsSecret, secret))) throw new Error('Metrics credential must be independent and at least 32 characters');
const origins = new Set(
  (process.env.GUI_ALLOWED_ORIGINS || "http://localhost:3000").split(","),
);
const capacity = Number(process.env.GUI_SESSION_CAPACITY || 4);
if (!Number.isInteger(capacity) || capacity < 1 || capacity > 64)
  throw new Error("Invalid GUI capacity");
const seccomp = fileURLToPath(
  new URL("../docker/seccomp.json", import.meta.url),
);
const sessions = new Map();
const docker = (...args) =>
  exec("docker", args, { maxBuffer: 1024 * 1024, timeout: 30000 });
if (process.env.GUI_REQUIRE_ROOTLESS === 'true') {
  if (process.env.GUI_TRIAL_ONLY !== 'true' || capacity !== 1)
    throw new Error('Rootless public Turtle pilot must use the one-session trial profile');
  assertRootlessRuntime(JSON.parse((await docker('info', '--format', '{{json .}}')).stdout));
}
const poolName = process.env.GUI_TRIAL_ONLY === 'true' ? 'trial' : 'course';
const instance = process.env.GUI_INSTANCE_ID || poolName;
if (!/^[a-z0-9-]{1,64}$/.test(instance)) throw new Error('Invalid broker instance');
// Custom instances exist only for isolated local fixtures, never shared production brokers.
if (process.env.NODE_ENV === 'production' && instance !== poolName) throw new Error('Production broker instance must match its pool');
await reapPrevious((signal, ...args) => exec('docker', args, { signal, timeout: 15000, maxBuffer: 1024 * 1024 }), poolName, instance);
const versions = new Map();
let runtimeVersion;
for (const approvedReference of runtimeImages(image, process.env.GUI_RETAINED_RUNTIME_IMAGES, process.env.NODE_ENV === "production")) {
  const approvedImage = JSON.parse((await docker("image", "inspect", approvedReference)).stdout)[0].Id;
  const runtimeInfo = JSON.parse(
  (
    await docker(
      "run",
      "--rm",
      "--network",
      "none",
      "--read-only",
      "--cap-drop",
      "ALL",
      "--entrypoint",
      "python3",
      approvedImage,
      "-c",
      "import json,sys,tkinter; print(json.dumps({'python':sys.version.split()[0],'tk':str(tkinter.TkVersion)}))",
    )
  ).stdout,
);
  const version = `${approvedImage};python=${runtimeInfo.python};tk=${runtimeInfo.tk}`;
  versions.set(version, approvedImage);
  if (approvedReference === image) runtimeVersion = version;
}
const telemetry = new Telemetry();
const wantsWarm = process.env.GUI_WARM_STANDBY === '1';
const envelope = wantsWarm && process.env.GUI_WARM_ENVELOPE_FILE ? JSON.parse(await readFile(process.env.GUI_WARM_ENVELOPE_FILE, 'utf8')) : null;
const sliceMetrics = wantsWarm && process.env.GUI_WARM_SLICE_METRICS_FILE ? await readFile(process.env.GUI_WARM_SLICE_METRICS_FILE, 'utf8') : '';
const warmEnabled = validateWarmConfiguration(process.env, envelope, Date.now(), sliceMetrics);
const driver = createSandboxDriver({ seccomp, pool: poolName, instance, telemetry });
const sandboxes = new StandbyPool({ driver, telemetry, enabled: warmEnabled, capacity, instance,
  profile: { runtimeImage: versions.get(runtimeVersion), width: 1024, height: 640, memoryLimitMb: 512 } });
const scheduler = new SessionScheduler(sessions, capacity, launch, () => !shuttingDown && sandboxes.status().healthy && !sandboxes.status().draining);
let shuttingDown = false;
function markClosed(s, state) {
  if (s.closed) return;
  s.closed = true; s.controller.abort(); s.data = null; s.pendingBytes = 0;
  s.state = state; s.endedAt = Date.now();
  clearTimeout(s.deadline); clearTimeout(s.reconnect);
  s.program?.kill();
  for (const bridge of s.bridges) bridge.kill();
  for (const ws of s.sockets) ws.close();
  console.log(JSON.stringify({ event: 'gui.ended', sessionId: s.id, state }));
}
async function release(s) {
  await sandboxes.retire(s.handle);
  // Failed/unknown cleanup holds the scheduler slot. The maintenance sweep retries.
  if (!s.handle || !sandboxes.entries.has(s.handle)) {
    scheduler.release(s);
    if (!scheduler.active) sandboxes.refill();
    if (!s.forgetTimer) s.forgetTimer = setTimeout(() => sessions.delete(s.id), 60000).unref();
    const retired = [...sessions.values()].filter(old => old.closed && !old.occupies);
    for (const old of retired.slice(0, Math.max(0, retired.length - capacity * 4))) {
      clearTimeout(old.forgetTimer); sessions.delete(old.id);
    }
  }
}
async function stop(s, state = 'STOPPED') {
  markClosed(s, state);
  await (s.stopTask ||= (async () => {
    await s.launchTask?.catch(() => {});
    await release(s);
  })());
  if (s.occupies) throw Object.assign(new Error('GUI cleanup pending'), { status: 503 });
}
function backgroundStop(s, state) { void stop(s, state).catch(() => {}); }
async function start(body, traceId) {
  const data = validateRun(body);
  if (shuttingDown || !sandboxes.status().healthy) throw Object.assign(new Error('Runtime unavailable'), { status: 503 });
  if (process.env.GUI_TRIAL_ONLY === 'true' && (
    data.timeLimitSeconds !== 120 || data.memoryLimitMb !== 512 ||
    data.width !== 1024 || data.height !== 640 || data.outputLimitBytes !== 262144 ||
    data.assets.length || data.entryPoint !== '_cove_trial_runner.py' ||
    !data.owner.startsWith('trial:') || !data.requestKey || !data.authorizationExpiresAt
  )) throw Object.assign(new Error('Invalid trial execution profile'), { status: 400 });
  const previous = [...sessions.values()].find(s => s.owner === data.owner && s.requestKey === data.requestKey && data.requestKey);
  if (previous) return previous;
  const pendingBytes = Buffer.byteLength(JSON.stringify(data));
  if ([...sessions.values()].reduce((sum, s) => sum + (s.pendingBytes || 0), 0) + pendingBytes > 64 * 1024 * 1024 ||
      [...sessions.values()].filter(s => !s.closed && s.state === 'QUEUED').length >= capacity * 4)
    throw Object.assign(new Error('GUI queue is full; try again shortly'), { status: 429 });
  if ([...sessions.values()].some(s => !s.closed && s.owner === data.owner))
    throw Object.assign(new Error('A GUI run is already active'), { status: 409 });
  const s = { id: randomUUID(), owner: data.owner, requestKey: data.requestKey,
    traceId: /^[a-f0-9-]{36}$/.test(traceId || '') ? traceId : randomUUID(),
    outputLimitBytes: data.outputLimitBytes, authorizationExpiresAt: data.authorizationExpiresAt,
    runtimeImage: selectRuntimeImage(versions, runtimeVersion, body.runtimeVersion), token: randomBytes(32).toString('hex'),
    state: 'QUEUED', data, pendingBytes, queuedAt: Date.now(), output: '', outputBytes: 0, closed: false,
    sockets: new Set(), viewers: new Map(), bridges: new Set(), controller: new AbortController(),
    expiresAt: Date.now() + data.timeLimitSeconds * 1000, lease: Date.now() + 30000 };
  sessions.set(s.id, s);
  scheduler.dispatch();
  return s.launchTask ? await s.launchTask : s;
}
async function launch(s) {
  const data = s.data;
  const began = performance.now();
  s.preparationStartedAt = Date.now();
  telemetry.observe('queue', 'cold', Math.max(0, Date.now() - s.queuedAt));
  function authorized() {
    s.controller.signal.throwIfAborted();
    if (s.authorizationExpiresAt && s.authorizationExpiresAt <= Date.now()) throw new Error('Authorization expired');
  }
  function startExecutionBudget() {
    s.startedAt = Date.now(); s.expiresAt = s.startedAt + data.timeLimitSeconds * 1000;
    s.deadline = setTimeout(() => backgroundStop(s, 'TIMED_OUT'), Math.min(data.timeLimitSeconds * 1000,
      s.authorizationExpiresAt ? s.authorizationExpiresAt - Date.now() : Infinity)).unref();
  }
  try {
    authorized();
    if (Date.now() - s.queuedAt > 60000 || s.lease < Date.now()) throw new Error('Queue expired');
    // Preserve course accounting; only the public trial excludes startup time.
    if (poolName === 'course') startExecutionBudget();
    const profile = { runtimeImage: s.runtimeImage, width: data.width, height: data.height, memoryLimitMb: data.memoryLimitMb };
    s.handle = await sandboxes.claim(profile, AbortSignal.any([s.controller.signal, AbortSignal.timeout(30000)]), entry => { s.handle = entry; });
    s.container = s.handle.id;
    const signal = AbortSignal.any([s.controller.signal, AbortSignal.timeout(15000)]);
    authorized();
    await telemetry.time('assets', s.handle.mode, () => driver.assets(s.handle, data.assets, signal));
    signal.throwIfAborted(); authorized();
    if (poolName === 'trial') startExecutionBudget();
    const spawnStart = performance.now();
    s.program = driver.program(s.handle, data);
    s.program.on('error', () => backgroundStop(s, 'ERROR'));
    s.program.stdin.on('error', () => { if (!s.closed) backgroundStop(s, 'ERROR'); });
    s.program.stdin.write(JSON.stringify({ files: data.files, entryPoint: data.entryPoint }) + '\n');
    telemetry.observe('spawn', s.handle.mode, performance.now() - spawnStart);
    s.data = null; s.pendingBytes = 0; s.state = 'RUNNING'; s.lease = Date.now() + 30000;
    const output = (text, rawBytes = 0) => {
      if (s.closed) return;
      s.outputBytes += Math.max(rawBytes, Buffer.byteLength(text));
      if (s.outputBytes > s.outputLimitBytes) { s.output += '\nOutput limit exceeded'; backgroundStop(s, 'OUTPUT_LIMIT'); }
      else s.output += text;
    };
    for (const stream of [s.program.stdout, s.program.stderr]) {
      const decoder = new StringDecoder('utf8');
      const parser = terminalParser(state => { if (!s.closed) s.state = state; });
      stream.on('data', chunk => output(parser.push(decoder.write(chunk)), chunk.length));
      stream.on('end', () => { output(parser.push(decoder.end())); output(parser.end()); });
    }
    s.program.on('close', code => {
      if (s.closed) return;
      s.state = code === 0 ? 'FINISHED' : 'ERROR'; s.endedAt = Date.now(); s.exitCode = code;
      clearTimeout(s.deadline);
      s.deadline = setTimeout(() => backgroundStop(s, s.state), 30000).unref();
    });
    telemetry.observe('launch', s.handle.mode, performance.now() - began);
    console.log(JSON.stringify({ event: 'gui.started', traceId: s.traceId, sessionId: s.id,
      mode: s.handle.mode, durationMs: Math.round(performance.now() - began), runtimeImage: s.runtimeImage,
      width: data.width, height: data.height, memoryLimitMb: data.memoryLimitMb, timeLimitSeconds: data.timeLimitSeconds }));
    sandboxes.refill();
    return s;
  } catch {
    const cancelled = s.closed;
    telemetry.increment('launch_failure');
    markClosed(s, s.closed ? s.state : 'ERROR');
    // Do not await stop(s) from its own launch promise.
    await release(s);
    if (cancelled && !s.occupies) return s;
    throw Object.assign(new Error('GUI launch failed'), { status: 503 });
  }
}
function view(s) {
  return {
    id: s.id,
    token: s.token,
    state: s.state,
    output: s.output,
    expiresAt: s.expiresAt,
    exitCode: s.exitCode,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    runtimeImage: s.runtimeImage,
    containerId: s.container,
    startupMode: s.handle?.mode,
    queueWaitMs: s.preparationStartedAt ? Math.max(0, s.preparationStartedAt - s.queuedAt) : undefined,
  };
}
async function read(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 30000000)
      throw Object.assign(new Error("Payload too large"), { status: 413 });
    chunks.push(chunk);
  }
  return bytes ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}
const server = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === 'GET' && req.url === '/metrics') {
    if (!metricsSecret || !equalSecret(req.headers.authorization, `Bearer ${metricsSecret}`)) {
      res.writeHead(401); res.end('{}'); return;
    }
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.end(telemetry.render({ ...sandboxes.status(), active: scheduler.active,
      queued: [...sessions.values()].filter(s => !s.closed && s.state === 'QUEUED').length }));
    return;
  }
  if (!equalSecret(req.headers.authorization, `Bearer ${secret}`)) {
    res.writeHead(401);
    res.end("{}");
    return;
  }
  try {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET" && url.pathname === "/health") {
      res.end(
        JSON.stringify({
          ready: !shuttingDown && sandboxes.status().healthy,
          standby: sandboxes.status(),
          runtimeVersion,
          pool: process.env.GUI_TRIAL_ONLY === 'true' ? 'trial' : 'course',
          capacity,
          active: [...sessions.values()].filter((s) => !s.closed).length,
        }),
      );
      return;
    }
    if (req.method === "POST" && url.pathname === "/sessions") {
      const session = await start(await read(req), req.headers['x-cove-trace-id']);
      res.writeHead(201);
      res.end(JSON.stringify(view(session)));
      return;
    }
    if (req.method === "GET" && url.pathname.startsWith("/owners/")) {
      const owner = decodeURIComponent(url.pathname.slice("/owners/".length));
      const requestKey = url.searchParams.get("requestKey");
      const found = [...sessions.values()].find((s) => s.owner === owner && s.requestKey === requestKey);
      res.writeHead(found ? 200 : 404);
      res.end(JSON.stringify(found ? view(found) : {}));
      return;
    }
    const match = url.pathname.match(
        /^\/sessions\/([a-f0-9-]+)(\/(?:input|view))?$/,
      ),
      s = match && sessions.get(match[1]);
    if (!s) {
      res.writeHead(404);
      res.end("{}");
      return;
    }
    if (req.method === "POST" && match[2] === "/view") {
      if (s.closed) throw new Error("Session has ended");
      const { token } = await read(req);
      const capability =
        token && s.viewers.has(token) ? token : randomBytes(32).toString("hex");
      if (!s.viewers.has(capability) && s.viewers.size >= 8)
        throw new Error("Viewer capacity reached");
      s.viewers.set(capability, Date.now() + 30000);
      res.end(
        JSON.stringify({ ...view(s), token: capability, readOnly: true }),
      );
      return;
    }
    if (req.method === "GET") {
      s.lease = Date.now() + 30000;
      res.end(JSON.stringify(view(s)));
      return;
    }
    if (req.method === "DELETE") {
      await stop(s);
      res.end("{}");
      return;
    }
    if (req.method === "POST" && match[2]) {
      const { text } = await read(req);
      if (
        typeof text !== "string" ||
        Buffer.byteLength(text) > 4096 ||
        !["RUNNING", "WAITING_INPUT"].includes(s.state)
      )
        throw new Error("Invalid input");
      s.program.stdin.write(text + "\n");
      res.end("{}");
      return;
    }
    res.writeHead(405);
    res.end("{}");
  } catch (error) {
    // Fixed policy failures are safe operational diagnostics. Never log the
    // request manifest, source, capabilities or arbitrary parser messages.
    if (/^Invalid (trial execution profile|files|entry point or source size|owner|request key|authorization expiry|output limit|source path|assets|asset size|asset)$/.test(error.message) || error.message === 'Sandbox isolation verification failed')
      console.warn(JSON.stringify({ event: 'gui.rejected', status: error.status || 400, reason: error.message }));
    res.writeHead(error.status || 400);
    res.end(JSON.stringify({ message: error.message }));
  }
});
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 1024 * 1024,
  perMessageDeflate: false,
  handleProtocols: (protocols) => [...protocols][0],
});
server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, "http://localhost"),
    match = url.pathname.match(/^\/sessions\/([a-f0-9-]+)\/display$/),
    s = match && sessions.get(match[1]);
  const protocol = String(req.headers["sec-websocket-protocol"] || "");
  const viewer = [...(s?.viewers ?? [])].find(
    ([token, expiry]) =>
      expiry > Date.now() && equalSecret(protocol, `cove.${token}`),
  );
  if (
    !s ||
    !s.container ||
    s.state === "QUEUED" ||
    s.closed ||
    s.lease < Date.now() ||
    !origins.has(req.headers.origin) ||
    (!equalSecret(protocol, `cove.${s.token}`) && !viewer)
  ) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    if (!viewer) clearTimeout(s.reconnect);
    ws.viewerToken = viewer?.[0];
    s.sockets.add(ws);
    const bridge = spawn(
      "docker",
      [
        "exec",
        "-i",
        s.container,
        "socat",
        "STDIO",
        `TCP:127.0.0.1:${viewer ? 5901 : 5900}`,
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    s.bridges.add(bridge);
    bridge.stdout.on("data", (chunk) => {
      if (ws.readyState === ws.OPEN) {
        if (ws.bufferedAmount > 4 * 1024 * 1024) {
          ws.close();
          return;
        }
        ws.send(chunk);
      }
    });
    ws.on("message", (data, binary) => {
      if (!binary) {
        ws.close();
        return;
      }
      if (!bridge.stdin.write(data)) ws.pause();
    });
    bridge.stdin.on("drain", () => ws.resume());
    bridge.on("error", () => ws.close());
    bridge.on("exit", () => ws.close());
    ws.on("close", () => {
      bridge.kill();
      s.bridges.delete(bridge);
      s.sockets.delete(ws);
      if (!s.closed && ![...s.sockets].some((socket) => !socket.viewerToken)) {
        s.reconnect = setTimeout(() => backgroundStop(s, "DISCONNECTED"), 30000);
        s.reconnect.unref();
      }
    });
  });
});
sandboxes.refill();
let sweeping = false;
setInterval(async () => {
  if (sweeping || shuttingDown) return;
  sweeping = true;
  try {
    await sandboxes.reconcile(false);
    for (const s of sessions.values()) {
      if (s.closed) { if (s.occupies) await release(s); continue; }
      for (const [token, expiry] of s.viewers) if (expiry < Date.now()) s.viewers.delete(token);
      for (const socket of s.sockets) if (socket.viewerToken && (s.viewers.get(socket.viewerToken) || 0) < Date.now()) socket.close();
      if (s.authorizationExpiresAt && s.authorizationExpiresAt <= Date.now()) backgroundStop(s, 'DISCONNECTED');
      else if (s.state !== 'STARTING' && s.lease < Date.now()) backgroundStop(s, 'DISCONNECTED');
      else if (s.state === 'QUEUED' && Date.now() - s.queuedAt > 60000) backgroundStop(s, 'QUEUE_EXPIRED');
    }
    if (sandboxes.status().healthy) scheduler.dispatch();
    if (![...sessions.values()].some(s => !s.closed && s.state === 'STARTING')) sandboxes.refill();
  } finally { sweeping = false; }
}, 1000).unref();
server.listen(
  Number(process.env.GUI_PORT || 4010),
  process.env.GUI_BIND_ADDRESS || "127.0.0.1",
  () => console.log("GUI service ready"),
);
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  sandboxes.closed = true;
  server.close();
  await Promise.all([...sessions.values()].map((s) => stop(s)));
  await sandboxes.close();
  process.exit(sandboxes.entries.size ? 1 : 0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
