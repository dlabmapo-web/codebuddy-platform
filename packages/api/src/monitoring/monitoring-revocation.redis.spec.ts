import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createAdapter } from "@socket.io/redis-streams-adapter";
import { monitoringRooms, monitoringServerEvents } from "@cove/shared";
import { Redis } from "ioredis";
import { Server, type Socket as ServerSocket } from "socket.io";
import { io, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MonitoringRevocationService } from "./monitoring-revocation.service.js";
import { MonitoringMetricsService } from "./monitoring-metrics.service.js";
import type { MonitoringVisitService } from "./monitoring-visit.service.js";
import { WatchSessionRegistry, type WatchLease } from "./watch-session.registry.js";

const url = process.env.MONITORING_TEST_REDIS_URL;
describe.skipIf(!url)("scoped revocation across real Redis adapters", () => {
  const prefix = randomUUID();
  const servers: Server[] = [];
  const connections: Redis[] = [];
  const clients: Socket[] = [];
  let registry: WatchSessionRegistry;
  let ownerRegistry: WatchSessionRegistry;
  let ownerPort: number;
  beforeAll(async () => {
    for (let index = 0; index < 2; index++) {
      const http = createServer();
      const server = new Server(http);
      const redis = new Redis(url!);
      connections.push(redis);
      server.adapter(createAdapter(redis, { streamName: `test:${prefix}:stream` }));
      servers.push(server);
      await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
      if (index === 1) ownerPort = (http.address() as { port: number }).port;
    }
    const commands = new Redis(url!); const otherCommands = new Redis(url!);
    connections.push(commands, otherCommands);
    registry = new WatchSessionRegistry(commands);
    ownerRegistry = new WatchSessionRegistry(otherCommands);
  });
  afterAll(async () => {
    clients.forEach(client => client.close());
    await Promise.all(servers.map(server => new Promise<void>(resolve => server.close(() => resolve()))));
    await Promise.all(connections.map(redis => redis.quit()));
  });
  function lease(): WatchLease {
    return { sessionId: randomUUID(), visitId: randomUUID(), generation: 1,
      teacherMembershipId: prefix, academyId: prefix, classId: randomUUID(),
      studentMembershipId: randomUUID(), draftId: randomUUID(), mode: "MONITORING" };
  }
  async function connect(watch: WatchLease): Promise<{ client: Socket; socket: ServerSocket }> {
    const socketPromise = new Promise<ServerSocket>(resolve => servers[1]!.once("connection", resolve));
    const client = io(`http://127.0.0.1:${ownerPort}`, { transports: ["websocket"], forceNew: true });
    clients.push(client);
    const socket = await socketPromise;
    socket.data.teacher = { membershipId: watch.teacherMembershipId, claims: new Map(),
      watch: { visitId: watch.visitId, draftId: watch.draftId, claim: { studentMembershipId: watch.studentMembershipId } } };
    await socket.join([
      monitoringRooms.teacher(watch.academyId, watch.teacherMembershipId),
      monitoringRooms.draft(watch.academyId, watch.draftId),
      monitoringRooms.classPresence(watch.academyId, watch.classId),
      monitoringRooms.watchContext(watch.academyId, watch.classId, watch.studentMembershipId),
    ]);
    await ownerRegistry.register(watch);
    return { client, socket };
  }
  it("evicts the exact remote visit and preserves another tab and its stream", async () => {
    const revoked = lease(); const retained = lease();
    const first = await connect(revoked); const second = await connect(retained);
    const unrelated = vi.fn(); second.client.on(monitoringServerEvents.accessRevoked, unrelated);
    const received = new Promise<void>(resolve => first.client.once(monitoringServerEvents.watchEnded, () => resolve()));
    const ended = { id: revoked.visitId, academyId: revoked.academyId, classId: revoked.classId,
      teacherMembershipRef: revoked.teacherMembershipId, studentMembershipRef: revoked.studentMembershipId };
    const visits = { endOpenVisits: vi.fn().mockResolvedValue([ended]) } as unknown as MonitoringVisitService;
    const service = new MonitoringRevocationService(visits, new MonitoringMetricsService(), registry);
    service.attach(servers[0]!);
    await service.revokeScope({ classId: revoked.classId, studentMembershipRef: revoked.studentMembershipId }, "ENROLLMENT_REMOVED");
    await received;
    await expect.poll(() => first.socket.rooms.has(monitoringRooms.draft(revoked.academyId, revoked.draftId))).toBe(false);
    expect(first.socket.connected).toBe(true);
    expect(await ownerRegistry.isCurrent(revoked)).toBeNull();
    expect(await ownerRegistry.isCurrent(retained)).not.toBeNull();
    const delivery = new Promise<string>(resolve => second.client.once("test.document", resolve));
    servers[0]!.to(monitoringRooms.draft(retained.academyId, retained.draftId)).emit("test.document", "still live");
    expect(await delivery).toBe("still live");
    expect(unrelated).not.toHaveBeenCalled();
  }, 15_000);
  it("removes a remote roster grant even when there is no open visit", async () => {
    const watch = lease(); const peer = await connect(watch);
    peer.socket.data.teacher.watch = null;
    const otherClass = randomUUID();
    await peer.socket.join(monitoringRooms.classPresence(prefix, otherClass));
    const visits = { endOpenVisits: vi.fn().mockResolvedValue([]) } as unknown as MonitoringVisitService;
    const service = new MonitoringRevocationService(visits, new MonitoringMetricsService(), registry);
    service.attach(servers[0]!);
    await service.revokeClass(watch.classId, "CLASS_ARCHIVED");
    await expect.poll(() => peer.socket.rooms.has(monitoringRooms.classPresence(prefix, watch.classId))).toBe(false);
    expect(peer.socket.rooms.has(monitoringRooms.classPresence(prefix, otherClass))).toBe(true);
    expect(peer.socket.connected).toBe(true);
  }, 15_000);
});
