import test from "node:test";
import assert from "node:assert/strict";
import { assertRootlessRuntime, validateRun, equalSecret } from "./policy.mjs";
test('rootless pilot refuses rootful daemons and missing resource enforcement', () => {
  const info = { SecurityOptions: ['name=rootless'], CgroupDriver: 'systemd', CgroupVersion: '2', MemoryLimit: true, CpuCfsQuota: true, PidsLimit: true };
  assert.doesNotThrow(() => assertRootlessRuntime(info));
  for (const patch of [{ SecurityOptions: [] }, { CgroupDriver: 'none' }, { CgroupVersion: '1' }, { MemoryLimit: false }, { CpuCfsQuota: false }, { PidsLimit: false }])
    assert.throws(() => assertRootlessRuntime({ ...info, ...patch }));
  assert.throws(() => assertRootlessRuntime(null));
});
const run = {
  files: { "main.py": "print(1)" },
  entryPoint: "main.py",
  width: 1024,
  height: 640,
  timeLimitSeconds: 10,
  memoryLimitMb: 512,
  owner: "test",
};
test("accept bounded source and reject paths and quota bypass", () => {
  assert.deepEqual(validateRun(run), { ...run, assets: [], outputLimitBytes: 1048576 });
  for (const files of [
    { "../main.py": "" },
    { "/main.py": "" },
    { "main.py": 0 },
    { "main.py": "x".repeat(1048577) },
  ])
    assert.throws(() => validateRun({ ...run, files }));
  for (const memoryLimitMb of [0, 1024, NaN])
    assert.throws(() => validateRun({ ...run, memoryLimitMb }));
});
test('trusted output caps are bounded and source completion survives stream fragmentation', async () => {
  assert.equal(validateRun({ ...run, outputLimitBytes: 262144 }).outputLimitBytes, 262144);
  for (const outputLimitBytes of [0, -1, 1048577, '262144']) assert.throws(() => validateRun({ ...run, outputLimitBytes }));
  const { terminalParser } = await import('./policy.mjs');
  const states = []; const parser = terminalParser(state => states.push(state));
  assert.equal(parser.push('finished\x1eCOVE_DIS'), 'finished');
  assert.equal(parser.push('PLAYING\x1f'), '');
  assert.deepEqual(states, ['DISPLAYING']);
});
test("capability comparison rejects absent and different secrets", () => {
  assert.equal(equalSecret("token", "token"), true);
  assert.equal(equalSecret(undefined, undefined), false);
  assert.equal(equalSecret("a", "b"), false);
});

test("terminal control markers survive fragmentation, preserve text and retain event order", async () => {
  const { terminalParser } = await import("./policy.mjs");
  const states = [];
  const parser = terminalParser((state) => states.push(state));
  assert.equal(parser.push("hello한글\x1eCOVE_WAIT"), "hello한글");
  assert.equal(
    parser.push("ING_INPUT\x1f name: \x1eCOVE_RUNNING\x1f"),
    " name: ",
  );
  assert.deepEqual(states, ["WAITING_INPUT", "RUNNING"]);
  assert.equal(parser.push("\x1eCOVE_"), "");
  assert.equal(parser.end(), "\x1eCOVE_");
});
