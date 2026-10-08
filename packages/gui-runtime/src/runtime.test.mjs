import { test } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
const secret = process.env.GUI_SERVICE_SECRET;
const base = process.env.GUI_SERVICE_URL ?? "http://127.0.0.1:4010";
const headers = {
  Authorization: `Bearer ${secret}`,
  "Content-Type": "application/json",
};
async function request(path, method = "GET", body) {
  const result = await fetch(base + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await result.json();
  assert.ok(result.ok, `${result.status}: ${data.message}`);
  return data;
}
async function until(id, predicate) {
  for (let i = 0; i < 100; i++) {
    const result = await request(`/sessions/${id}`);
    if (predicate(result)) return result;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.fail("Session did not reach expected state");
}
const profile = {
  entryPoint: "main.py",
  width: 640,
  height: 480,
  timeLimitSeconds: 20,
  memoryLimitMb: 128,
  owner: "runtime-tests",
};
test(
  "isolated CPython/Tk drawing, input and read-only lesson assets",
  { skip: !secret },
  async () => {
    const session = await request("/sessions", "POST", {
      ...profile,
      assets: [
        {
          name: "data.txt",
          data: Buffer.from("lesson asset").toString("base64"),
        },
      ],
      files: {
        "main.py": `import turtle, os, socket\ns=turtle.Screen(); s.setup(640,480)\na=turtle.Turtle(); b=turtle.Turtle(); a.shape('turtle'); a.color('red'); a.begin_fill(); a.circle(40); a.end_fill(); b.write('Hello'); s.update()\nprint('DRAWN',s.window_width(),s.window_height(),a.distance(b), flush=True)\nprint(open('assets/data.txt').read(),flush=True)\ntry:\n open('assets/data.txt','w').write('changed')\nexcept PermissionError:\n print('READ_ONLY',flush=True)\nprint('UID',os.getuid(),flush=True)\nprint('INPUT',input('name: '),flush=True)\nturtle.done()\n`,
      },
    });
    try {
      const ready = await until(
        session.id,
        (s) => s.output.includes("name:") && s.state === "WAITING_INPUT",
      );
      assert.equal(ready.state, "WAITING_INPUT");
      assert.match(ready.output, /DRAWN/);
      assert.match(ready.output, /READ_ONLY/);
      assert.match(ready.output, /UID 1000/);
      assert.match(ready.output, /lesson asset/);
      await request(`/sessions/${session.id}/input`, "POST", { text: "Cove" });
      await until(session.id, (s) => s.output.includes("INPUT Cove"));
      const protocol = await new Promise((resolve, reject) => {
        const ws = new WebSocket(
          base.replace("http", "ws") + `/sessions/${session.id}/display`,
          [`cove.${session.token}`],
          { origin: "http://localhost:3000" },
        );
        ws.on("message", (data) => {
          resolve(data.toString());
          ws.close();
        });
        ws.on("error", reject);
      });
      assert.match(protocol, /RFB 003/);
      const bad = await fetch(base + "/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      assert.equal(bad.status, 401);
      await request(`/sessions/${session.id}`, "DELETE");
      assert.equal((await request(`/sessions/${session.id}`)).state, "STOPPED");
    } finally {
      await request(`/sessions/${session.id}`, "DELETE");
    }
  },
);
test(
  "Python error, timeout, output quota, queued cancellation and clean recovery",
  { skip: !secret },
  async () => {
    const error = await request("/sessions", "POST", {
      ...profile,
      files: { "main.py": "raise RuntimeError('original error')" },
    });
    const failed = await until(error.id, (s) => s.state === "ERROR");
    assert.match(failed.output, /original error/);
    await request(`/sessions/${error.id}`, "DELETE");
    const timeout = await request("/sessions", "POST", {
      ...profile,
      timeLimitSeconds: 2,
      files: { "main.py": "while True: pass" },
    });
    await until(timeout.id, (s) => s.state === "TIMED_OUT");
    const output = await request("/sessions", "POST", {
      ...profile,
      files: { "main.py": "while True: print('x'*10000)" },
    });
    await until(output.id, (s) => s.state === "OUTPUT_LIMIT");
    const first = await request("/sessions", "POST", {
      ...profile,
      owner: "queue-first",
      files: { "main.py": "input()" },
    });
    const second = await request("/sessions", "POST", {
      ...profile,
      owner: "queue-second",
      files: { "main.py": "input()" },
    });
    const third = await request("/sessions", "POST", {
      ...profile,
      owner: "queue-third",
      files: { "main.py": "input()" },
    });
    assert.equal(third.state, "QUEUED");
    await request(`/sessions/${third.id}`, "DELETE");
    const admitted = await request("/sessions", "POST", {
      ...profile,
      owner: "queue-admitted",
      files: { "main.py": "print('ADMITTED',flush=True); input()" },
    });
    assert.equal(admitted.state, "QUEUED");
    await request(`/sessions/${first.id}`, "DELETE");
    await until(
      admitted.id,
      (s) => s.output.includes("ADMITTED") && s.state === "WAITING_INPUT",
    );
    for (const s of [admitted, second])
      await request(`/sessions/${s.id}`, "DELETE");
    const recovery = await request("/sessions", "POST", {
      ...profile,
      files: { "main.py": "print('RECOVERED')" },
    });
    await until(
      recovery.id,
      (s) => s.state === "FINISHED" && s.output.includes("RECOVERED"),
    );
    await request(`/sessions/${recovery.id}`, "DELETE");
  },
);

test(
  "enforced seccomp/capabilities, network and disk limits; passive display capability",
  { skip: !secret },
  async () => {
    const session = await request("/sessions", "POST", {
      ...profile,
      owner: "isolation-check",
      files: {
        "main.py": `import os,socket,subprocess
print(open('/proc/self/status').read(),flush=True)
assert not any(k in os.environ for k in ['DATABASE_URL','SUPABASE_SERVICE_ROLE_KEY','GUI_SERVICE_SECRET'])
assert not os.path.exists('/var/run/docker.sock')
try:
 socket.create_connection(('1.1.1.1',443),timeout=1)
except OSError:
 print('NETWORK_DENIED',flush=True)
try:
 open('/work/full','wb').write(b'x'*20000000)
except OSError:
 print('DISK_LIMIT',flush=True)
try:
 open('/etc/owned','w').write('x')
except OSError:
 print('ROOT_READ_ONLY',flush=True)
import turtle
turtle.Turtle().forward(30)
input('ready: ')
turtle.done()
`,
      },
    });
    try {
      const ready = await until(session.id, (s) => s.output.includes("ready:"));
      assert.match(ready.output, /Seccomp:\s+2/);
      assert.match(ready.output, /CapEff:\s+0000000000000000/);
      assert.match(ready.output, /NoNewPrivs:\s+1/);
      for (const marker of ["NETWORK_DENIED", "DISK_LIMIT", "ROOT_READ_ONLY"])
        assert.match(ready.output, new RegExp(marker));
      const passive = await request(`/sessions/${session.id}/view`, "POST", {});
      assert.equal(passive.readOnly, true);
      assert.notEqual(passive.token, session.token);
      const handshake = await new Promise((resolve, reject) => {
        const ws = new WebSocket(
          base.replace("http", "ws") + `/sessions/${session.id}/display`,
          [`cove.${passive.token}`],
          { origin: "http://localhost:3000" },
        );
        ws.once("message", (data) => {
          resolve(data.toString());
          ws.close();
        });
        ws.once("error", reject);
      });
      assert.match(handshake, /RFB 003/);
      const denied = await new Promise((resolve) => {
        const ws = new WebSocket(
          base.replace("http", "ws") + `/sessions/${session.id}/display`,
          ["cove.invalid"],
          { origin: "http://localhost:3000" },
        );
        ws.on("unexpected-response", (_req, res) => {
          resolve(res.statusCode);
          res.resume();
          ws.terminate();
        });
        ws.on("open", () => {
          resolve("unexpectedly connected");
          ws.close();
        });
        ws.on("error", (error) => resolve(error.message));
      });
      assert.match(String(denied), /socket hang up|401/);
    } finally {
      await request(`/sessions/${session.id}`, "DELETE");
    }
  },
);

test(
  "memory and process ceilings terminate safely and Stop removes descendants",
  { skip: !secret },
  async () => {
    const memory = await request("/sessions", "POST", {
      ...profile,
      owner: "memory-limit",
      files: {
        "main.py": "x=bytearray(400*1024*1024); print(len(x),flush=True)",
      },
    });
    const ended = await until(memory.id, (s) => s.state === "ERROR");
    assert.ok(ended.exitCode !== 0);
    await request(`/sessions/${memory.id}`, "DELETE");
    const processes = await request("/sessions", "POST", {
      ...profile,
      owner: "process-limit",
      files: {
        "main.py": `import subprocess\nchildren=[]\ntry:\n for i in range(100): children.append(subprocess.Popen(['sleep','60']))\nexcept OSError:\n print('PID_LIMIT',len(children),flush=True)\ninput()\n`,
      },
    });
    try {
      const ready = await until(processes.id, (s) =>
        s.output.includes("PID_LIMIT"),
      );
      assert.match(ready.output, /PID_LIMIT/);
    } finally {
      await request(`/sessions/${processes.id}`, "DELETE");
    }
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const check = await promisify(execFile)("docker", [
      "ps",
      "-aq",
      "--filter",
      `name=cove-gui-${processes.id}`,
    ]);
    assert.equal(check.stdout.trim(), "");
  },
);
