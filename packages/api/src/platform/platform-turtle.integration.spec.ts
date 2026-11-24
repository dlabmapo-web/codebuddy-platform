import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { turtleUsageResultSchema } from "@cove/shared";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import type { PlatformAccessService } from "../authorization/platform-access.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import { PrismaClient } from "../generated/prisma/client.js";
import { TurtleUsageRecorder } from "../turtle-trial/usage-recorder.js";
import { PlatformTurtleService } from "./platform-turtle.service.js";

const databaseUrl = process.env.COVE_INTEGRATION_DATABASE_URL;

describe.skipIf(!databaseUrl)("public Turtle usage against PostgreSQL", () => {
  const createClient = () => new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl! }), log: [{ emit: "event", level: "query" }] });
  let client: ReturnType<typeof createClient>;
  let recorder: TurtleUsageRecorder;
  let service: PlatformTurtleService;
  let statements = 0;
  const requirePermission = vi.fn();
  const [organizationId, a, b, unused] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const identity = { authUserId: randomUUID() } as SupabaseIdentity;
  const device = (n: number) => n.toString(16).padStart(32, "0");
  const at = (value: string) => new Date(value).getTime();
  const use = (academyId: string, n: number, kind: "entry" | "run" | "seen", when: string) =>
    recorder.record({ academyId, device: device(n), hash: "" }, kind, at(when));

  beforeAll(async () => {
    client = createClient();
    client.$on("query", () => { statements += 1; });
    const prisma = client as unknown as PrismaService;
    recorder = new TurtleUsageRecorder(prisma);
    service = new PlatformTurtleService(prisma, { requirePermission } as unknown as PlatformAccessService);
    await client.organization.create({ data: { id: organizationId, name: "Turtle", slug: `turtle-${organizationId}` } });
    await client.academy.createMany({ data: [a, b, unused].map((id, i) => ({ id, organizationId, name: `Turtle ${i}`, slug: `turtle-${id}` })) });
    // Seoul is UTC+9: 14:59Z is 23:59 on the 23rd, 15:00Z is midnight on the 24th.
    use(a, 1, "entry", "2026-11-23T14:59:00Z");
    use(a, 1, "run", "2026-11-23T15:00:00Z");
    use(a, 1, "run", "2026-11-24T01:10:00Z");
    use(a, 2, "run", "2026-11-24T01:50:00Z");
    use(b, 1, "entry", "2026-11-24T01:58:00Z");
    use(randomUUID(), 9, "run", "2026-11-24T01:58:00Z"); // A deleted academy.
    await recorder.flush();
    use(a, 2, "seen", "2026-11-24T01:57:00Z");
    use(a, 2, "run", "2026-11-24T01:40:00Z"); // Late arrival: adds, never rewinds.
    await recorder.flush();
  });
  afterAll(async () => {
    await client.academy.deleteMany({ where: { organizationId } });
    await client.organization.delete({ where: { id: organizationId } });
    await client.$disconnect();
  });
  const read = async (input: { from: string; to: string; academyId?: string }, now = "2026-11-24T02:00:00Z") => {
    const result = turtleUsageResultSchema.parse(await service.usage(identity, input, new Date(now)));
    return { ...result, of: (id: string) => result.academies.find((row) => row.academyId === id) };
  };

  it("counts one Seoul day by academy and hour, across the hour boundary", async () => {
    const day = await read({ from: "2026-11-24", to: "2026-11-24", academyId: a });
    expect(day.of(a)).toMatchObject({ activeNow: 1, devices: 2, entries: 0, runs: 4, lastUsedAt: "2026-11-24T01:57:00.000Z" });
    expect(day.of(b)).toMatchObject({ activeNow: 1, devices: 1, entries: 1, runs: 0 });
    expect(day.of(unused)).toMatchObject({ activeNow: 0, devices: 0, runs: 0, lastUsedAt: null });
    expect(day.unit).toBe("hour");
    expect(day.series).toHaveLength(24);
    expect(day.series[0]).toEqual({ at: "2026-11-23T15:00:00.000Z", devices: 1, entries: 0, runs: 1 });
    expect(day.series[10]).toMatchObject({ devices: 2, runs: 3 });
    // Two minutes into the next hour, the last hour's devices are still active.
    expect((await read({ from: "2026-11-24", to: "2026-11-24" }, "2026-11-24T02:01:00Z")).of(a)!.activeNow).toBe(1);
    expect((await read({ from: "2026-11-24", to: "2026-11-24" }, "2026-11-24T02:10:00Z")).of(a)!.activeNow).toBe(0);
  });
  it("counts a device once over several days, by Seoul day", async () => {
    const days = await read({ from: "2026-11-22", to: "2026-11-24", academyId: a });
    expect(days.of(a)).toMatchObject({ devices: 2, entries: 1, runs: 4 });
    expect(days.series.map((row) => [row.at, row.devices, row.runs])).toEqual([
      ["2026-11-21T15:00:00.000Z", 0, 0], ["2026-11-22T15:00:00.000Z", 1, 0], ["2026-11-23T15:00:00.000Z", 2, 4],
    ]);
  });
  it("reads in two statements and only with the platform permission", async () => {
    statements = 0;
    await read({ from: "2026-11-01", to: "2026-11-24" });
    expect(statements).toBe(2);
    expect(requirePermission).toHaveBeenLastCalledWith(identity.authUserId, "platform.analytics.read");
    requirePermission.mockRejectedValueOnce(new Error("denied"));
    await expect(read({ from: "2026-11-24", to: "2026-11-24" })).rejects.toThrow("denied");
    expect(statements).toBe(2);
  });
});
