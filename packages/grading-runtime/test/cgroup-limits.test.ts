import { test } from "node:test";
import assert from "node:assert/strict";
import {
  verifyCgroupLimits,
  type CgroupLimitReader,
} from "../src/cgroup-limits.js";
const root = "/sys/fs/cgroup",
  parent = `${root}/tenant`,
  envelope = `${parent}/cove`;
const budget = { envelopeMemoryMb: 2048, cpuSlots: 2 };
const errno = (code: string) => Object.assign(new Error(code), { code });
function fixture(mountRoot = "/") {
  const files = new Map<string, string | Error>([
    [`${envelope}/memory.max`, String(2048 * 1024 * 1024)],
    [`${envelope}/memory.swap.max`, "0"],
    [`${envelope}/cpu.max`, "200000 100000"],
    [`${parent}/memory.max`, "max"],
    [`${parent}/cpu.max`, "max 100000"],
  ]);
  const reads: string[] = [];
  const io: CgroupLimitReader = {
    mountInfo: async () =>
      `36 25 0:32 ${mountRoot} ${root} rw,nosuid,nodev,noexec - cgroup2 cgroup rw\n`,
    read: async (path) => {
      reads.push(path);
      const value = files.get(path);
      if (value === undefined) throw errno("ENOENT");
      if (value instanceof Error) throw value;
      return value;
    },
  };
  return { files, reads, io };
}
test("real cgroup hierarchy root may lack root-only limit interfaces", async () => {
  const f = fixture();
  await verifyCgroupLimits(envelope, budget, f.io);
  assert.ok(f.reads.includes(`${root}/memory.max`));
  assert.ok(f.reads.includes(`${root}/cpu.max`));
  assert.ok(f.reads.every((path) => path.startsWith(`${root}/`)));
});
test("missing limits on non-root ancestors and owned envelopes fail closed", async () => {
  for (const path of [
    `${parent}/memory.max`,
    `${parent}/cpu.max`,
    `${envelope}/memory.max`,
    `${envelope}/cpu.max`,
  ]) {
    const f = fixture();
    f.files.delete(path);
    await assert.rejects(verifyCgroupLimits(envelope, budget, f.io), {
      code: "ENOENT",
    });
  }
  const f = fixture();
  await assert.rejects(verifyCgroupLimits(root, budget, f.io), {
    code: "ENOENT",
  });
});
test("delegated subtree bind mount is not mistaken for the hierarchy root", async () => {
  const f = fixture("/delegated");
  await assert.rejects(verifyCgroupLimits(envelope, budget, f.io), {
    code: "ENOENT",
  });
  f.files.set(`${root}/memory.max`, "max");
  f.files.set(`${root}/cpu.max`, "max 100000");
  await verifyCgroupLimits(envelope, budget, f.io);
});
test("root limits that exist and tighter ancestors remain enforced", async () => {
  for (const path of [`${parent}/memory.max`, `${root}/memory.max`]) {
    const f = fixture();
    f.files.set(path, "1073741824");
    await assert.rejects(
      verifyCgroupLimits(envelope, budget, f.io),
      /Ancestor memory/,
    );
  }
  for (const path of [`${parent}/cpu.max`, `${root}/cpu.max`]) {
    const f = fixture();
    f.files.set(path, "100000 100000");
    await assert.rejects(
      verifyCgroupLimits(envelope, budget, f.io),
      /Ancestor CPU/,
    );
  }
});
test("root-only absence never masks permission, I/O or mount discovery errors", async () => {
  for (const code of ["EACCES", "EIO"])
    for (const file of ["memory.max", "cpu.max"]) {
      const f = fixture();
      f.files.set(`${root}/${file}`, errno(code));
      await assert.rejects(verifyCgroupLimits(envelope, budget, f.io), {
        code,
      });
    }
  const f = fixture();
  f.io.mountInfo = async () => {
    throw errno("EIO");
  };
  await assert.rejects(verifyCgroupLimits(envelope, budget, f.io), {
    code: "EIO",
  });
  f.io.mountInfo = async () => "";
  await assert.rejects(
    verifyCgroupLimits(envelope, budget, f.io),
    /mount boundary/,
  );
});
