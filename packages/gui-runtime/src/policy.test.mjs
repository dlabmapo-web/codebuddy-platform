import test from "node:test";
import assert from "node:assert/strict";
import { validateRun, equalSecret } from "./policy.mjs";
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
  assert.deepEqual(validateRun(run), { ...run, assets: [] });
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
