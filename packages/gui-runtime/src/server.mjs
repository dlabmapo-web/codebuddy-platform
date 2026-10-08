import { createServer } from "node:http";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { StringDecoder } from "node:string_decoder";
import { WebSocketServer } from "ws";
import { equalSecret, validateRun, terminalParser } from "./policy.mjs";
const exec = promisify(execFile);
const secret = process.env.GUI_SERVICE_SECRET;
if (!secret || secret.length < 32)
  throw new Error("GUI_SERVICE_SECRET must contain at least 32 characters");
const image = process.env.GUI_RUNTIME_IMAGE || "cove-gui-runtime:dev";
if (process.env.NODE_ENV === "production" && !image.includes("@sha256:"))
  throw new Error("Production GUI image must be pinned by digest");
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
const approvedImage = JSON.parse(
  (await docker("image", "inspect", image)).stdout,
)[0].Id;
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
const runtimeVersion = `${approvedImage};python=${runtimeInfo.python};tk=${runtimeInfo.tk}`;
async function stop(s, state = "STOPPED") {
  if (s.closed) return;
  s.closed = true;
  s.data = null;
  s.pendingBytes = 0;
  s.state = state;
  console.log(JSON.stringify({ event: "gui.ended", sessionId: s.id, state }));
  clearTimeout(s.deadline);
  clearTimeout(s.reconnect);
  s.program?.kill();
  for (const bridge of s.bridges) bridge.kill();
  for (const ws of s.sockets) ws.close();
  await docker("rm", "-f", s.container).catch(() => {});
  setTimeout(() => sessions.delete(s.id), 60000).unref();
  const closed = [...sessions.values()].filter((session) => session.closed);
  for (const old of closed.slice(0, Math.max(0, closed.length - capacity * 4)))
    sessions.delete(old.id);
}
async function start(body) {
  const data = validateRun(body);
  if (body.runtimeVersion && body.runtimeVersion !== runtimeVersion)
    throw Object.assign(
      new Error("The saved runtime version is not available"),
      { status: 503 },
    );
  const pendingBytes = Buffer.byteLength(JSON.stringify(data));
  if (
    [...sessions.values()].reduce(
      (sum, s) => sum + (!s.closed ? (s.pendingBytes ?? 0) : 0),
      0,
    ) +
      pendingBytes >
    64 * 1024 * 1024
  )
    throw Object.assign(
      new Error("GUI admission buffer is full; try again shortly"),
      { status: 429 },
    );
  const busy =
    [...sessions.values()].filter((s) => !s.closed && s.state !== "QUEUED")
      .length >= capacity;
  if (
    [...sessions.values()].filter((s) => !s.closed && s.state === "QUEUED")
      .length >=
    capacity * 4
  )
    throw Object.assign(new Error("GUI queue is full; try again shortly"), {
      status: 429,
    });
  if ([...sessions.values()].some((s) => !s.closed && s.owner === data.owner))
    throw Object.assign(new Error("A GUI run is already active"), {
      status: 409,
    });
  const id = randomUUID(),
    container = `cove-gui-${id}`;
  const s = {
    id,
    container,
    owner: data.owner,
    token: randomBytes(32).toString("hex"),
    state: busy ? "QUEUED" : "STARTING",
    data,
    pendingBytes,
    queuedAt: Date.now(),
    output: "",
    outputBytes: 0,
    closed: false,
    sockets: new Set(),
    viewers: new Map(),
    bridges: new Set(),
    expiresAt: Date.now() + data.timeLimitSeconds * 1000,
    lease: Date.now() + 30000,
  };
  sessions.set(id, s);
  if (busy) return s;
  return launch(s);
}
async function launch(s) {
  const { data, container } = s;
  s.state = "STARTING";
  s.expiresAt = Date.now() + data.timeLimitSeconds * 1000;
  s.deadline = setTimeout(
    () => void stop(s, "TIMED_OUT"),
    data.timeLimitSeconds * 1000,
  );
  s.deadline.unref();
  try {
    await docker(
      "run",
      "--detach",
      "--name",
      container,
      "--label",
      "cove.gui=true",
      "--network",
      "none",
      "--read-only",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--security-opt",
      `seccomp=${seccomp}`,
      "--cpus",
      "1",
      "--memory",
      `${data.memoryLimitMb}m`,
      "--memory-swap",
      `${data.memoryLimitMb}m`,
      "--pids-limit",
      "64",
      "--tmpfs",
      "/tmp:rw,nosuid,nodev,size=8m,uid=1000,gid=1000",
      "--tmpfs",
      "/work:rw,nosuid,nodev,size=16m,uid=1000,gid=1000",
      "--tmpfs",
      "/assets:rw,nosuid,nodev,noexec,size=21m,uid=0,gid=0",
      "--shm-size",
      "8m",
      "-e",
      `GUI_WIDTH=${data.width}`,
      "-e",
      `GUI_HEIGHT=${data.height}`,
      approvedImage,
    );
    for (let i = 0; i < 80; i++) {
      if (s.closed) throw new Error("Start cancelled");
      try {
        await docker(
          "exec",
          container,
          "python3",
          "-c",
          "import socket; s=socket.create_connection(('127.0.0.1',5900),.2); s.close()",
        );
        break;
      } catch {
        if (i === 79) throw new Error("GUI display unavailable");
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    const { stdout: inspection } = await docker("inspect", container);
    const info = JSON.parse(inspection)[0];
    if (
      info.Config.User !== "1000:1000" ||
      info.HostConfig.NetworkMode !== "none" ||
      !info.HostConfig.ReadonlyRootfs ||
      !info.HostConfig.CapDrop.includes("ALL") ||
      !info.HostConfig.SecurityOpt.includes("no-new-privileges") ||
      info.Mounts.some((m) => m.Type === "bind") ||
      info.HostConfig.Privileged ||
      info.HostConfig.Memory !== data.memoryLimitMb * 1048576 ||
      info.HostConfig.MemorySwap !== data.memoryLimitMb * 1048576 ||
      info.HostConfig.NanoCpus !== 1000000000 ||
      info.HostConfig.PidsLimit !== 64 ||
      !info.HostConfig.SecurityOpt.some(
        (option) =>
          option.startsWith("seccomp=") && !option.includes("unconfined"),
      ) ||
      info.HostConfig.CgroupnsMode !== "private"
    )
      throw new Error("Sandbox isolation verification failed");
    s.runtimeImage = info.Image;
    if (s.closed) throw new Error("Start cancelled");
    await new Promise((resolve, reject) => {
      const setup = spawn(
        "docker",
        ["exec", "--user", "0", "-i", container, "python3", "/opt/assets.py"],
        { stdio: ["pipe", "ignore", "pipe"] },
      );
      let error = "";
      setup.stderr.on("data", (chunk) => (error += chunk));
      setup.on("error", reject);
      setup.on("exit", (code) =>
        code === 0 ? resolve() : reject(new Error("Asset setup failed")),
      );
      setup.stdin.end(JSON.stringify(data.assets));
    });
    s.program = spawn(
      "docker",
      ["exec", "-i", container, "python3", "-u", "/opt/run.py"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    s.program.stdin.write(
      JSON.stringify({ files: data.files, entryPoint: data.entryPoint }) + "\n",
    );
    s.data = null;
    s.pendingBytes = 0;
    s.state = "RUNNING";
    s.lease = Date.now() + 30000;
    console.log(
      JSON.stringify({
        event: "gui.started",
        sessionId: s.id,
        runtimeImage: approvedImage,
        width: data.width,
        height: data.height,
        memoryLimitMb: data.memoryLimitMb,
        timeLimitSeconds: data.timeLimitSeconds,
      }),
    );
    const output = (text, rawBytes = 0) => {
      if (s.closed) return;
      s.outputBytes += Math.max(rawBytes, Buffer.byteLength(text));
      if (s.outputBytes > 1048576) {
        s.output += "\nOutput limit exceeded";
        void stop(s, "OUTPUT_LIMIT");
      } else s.output += text;
    };
    for (const stream of [s.program.stdout, s.program.stderr]) {
      const decoder = new StringDecoder("utf8");
      const parser = terminalParser((state) => {
        if (!s.closed) s.state = state;
      });
      stream.on("data", (chunk) =>
        output(parser.push(decoder.write(chunk)), chunk.length),
      );
      stream.on("end", () => {
        output(parser.push(decoder.end()));
        output(parser.end());
      });
    }
    s.program.on("error", () => void stop(s, "ERROR"));
    s.program.on("close", (code) => {
      if (s.closed) return;
      s.state = code === 0 ? "FINISHED" : "ERROR";
      s.exitCode = code;
      clearTimeout(s.deadline);
      s.deadline = setTimeout(() => void stop(s, s.state), 30000);
      s.deadline.unref();
    });
    return s;
  } catch (error) {
    await stop(s, "ERROR");
    await docker("rm", "-f", s.container).catch(() => {});
    throw error;
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
    runtimeImage: s.runtimeImage,
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
          ready: true,
          runtimeVersion,
          capacity,
          active: [...sessions.values()].filter((s) => !s.closed).length,
        }),
      );
      return;
    }
    if (req.method === "POST" && url.pathname === "/sessions") {
      const session = await start(await read(req));
      res.writeHead(201);
      res.end(JSON.stringify(view(session)));
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
        s.reconnect = setTimeout(() => void stop(s, "DISCONNECTED"), 30000);
        s.reconnect.unref();
      }
    });
  });
});
// Containers left by a crashed service cannot survive into a new service generation.
const previous = await docker("ps", "-aq", "--filter", "label=cove.gui=true");
for (const id of previous.stdout.trim().split("\n").filter(Boolean))
  await docker("rm", "-f", id);
setInterval(() => {
  for (const s of sessions.values()) {
    if (s.closed) continue;
    for (const [token, expiry] of s.viewers)
      if (expiry < Date.now()) s.viewers.delete(token);
    for (const socket of s.sockets)
      if (
        socket.viewerToken &&
        (s.viewers.get(socket.viewerToken) ?? 0) < Date.now()
      )
        socket.close();
    if (s.state !== "STARTING" && s.lease < Date.now())
      void stop(s, "DISCONNECTED");
    else if (s.state === "QUEUED") {
      if (Date.now() - s.queuedAt > 60000) void stop(s, "QUEUE_EXPIRED");
      else if (
        [...sessions.values()].filter((a) => !a.closed && a.state !== "QUEUED")
          .length < capacity
      )
        void launch(s).catch(() => {});
    }
  }
}, 1000).unref();
server.listen(
  Number(process.env.GUI_PORT || 4010),
  process.env.GUI_BIND_ADDRESS || "127.0.0.1",
  () => console.log("GUI service ready"),
);
async function shutdown() {
  server.close();
  await Promise.all([...sessions.values()].map((s) => stop(s)));
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
