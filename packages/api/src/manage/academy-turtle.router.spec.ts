import type { PrismaService } from "../database/prisma.service.js";
import { describe, expect, it, vi } from 'vitest';
import { createRouterClient, implement } from '@orpc/server';
import { appContract } from '@cove/shared';
import { AcademyAccessService } from '../authorization/academy-access.service.js';
import { AcademyTurtleService } from './academy-turtle.service.js';
import { createManageRouters } from './manage.router.js';
import type { ORPCContext, ORPCDeps } from '../orpc/context.js';

const academyId = '20000000-0000-4000-8000-000000000001';
const foreign = '20000000-0000-4000-8000-000000000002';
const version = '30000000-0000-4000-8000-000000000001';
describe('manager Turtle oRPC authorization', () => {
  function setup(role: string, target = academyId, authenticated = true) {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: 'actor', status: 'ACTIVE', platformRole: 'USER' }) },
      academy: { findUnique: vi.fn().mockResolvedValue({ id: target, name: 'Test', status: 'ACTIVE', kind: 'ACADEMY' }) },
      academyMembership: { findUnique: vi.fn(async ({ where }: { where: { academyId_userId: { academyId: string } } }) => where.academyId_userId.academyId === academyId
        ? { status: 'ACTIVE', role, extraRoles: [], academy: { status: 'ACTIVE' } } : null) },
    };
    const access = new AcademyAccessService(prisma as never, { findLive: vi.fn().mockResolvedValue(null) } as never);
    const pins = {
      available: () => true,
      state: vi.fn().mockResolvedValue({ available: true, current: null }),
      reveal: vi.fn().mockResolvedValue({ pin: '000123', current: { version, updatedAt: '2026-10-22T00:00:00Z' } }),
      generate: vi.fn().mockResolvedValue({ pin: '000123', current: { version, updatedAt: '2026-10-22T00:00:00Z' } }),
    };
    const service = new AcademyTurtleService(access, prisma as never, { write: vi.fn().mockResolvedValue({}) } as never,
      pins as never, { limit: vi.fn() } as never);
    const deps = { academyTurtleService: service, supabaseAuthService: { verifyAccessToken: vi.fn().mockResolvedValue({ authUserId: 'auth-actor' }) } } as unknown as ORPCDeps;
    const os = implement(appContract).$context<ORPCContext>();
    const router = createManageRouters(os, deps).academyTurtle;
    const headers = vi.fn();
    const client = createRouterClient(router, { context: { req: { headers: authenticated ? { authorization: 'Bearer fixture-token' } : {}, res: { setHeader: headers } } as never } });
    return { client, pins, headers };
  }
  it.each(['STUDENT', 'TEACHER', 'TEAM_LEAD'])('refuses %s for metadata, reveal and generation', async role => {
    const { client, pins } = setup(role);
    await expect(client.state({ academyId })).rejects.toThrow();
    await expect(client.reveal({ academyId, expectedVersion: version })).rejects.toThrow();
    await expect(client.generate({ academyId, expectedVersion: null })).rejects.toThrow();
    expect(pins.state).not.toHaveBeenCalled(); expect(pins.generate).not.toHaveBeenCalled(); expect(pins.reveal).not.toHaveBeenCalled();
  });
  it('requires authentication and rejects a manager targeting another academy', async () => {
    await expect(setup('MANAGER', academyId, false).client.state({ academyId })).rejects.toThrow();
    const { client, pins } = setup('MANAGER', foreign);
    await expect(client.generate({ academyId: foreign, expectedVersion: null })).rejects.toThrow();
    expect(pins.generate).not.toHaveBeenCalled();
  });
  it('allows the academy manager and marks sensitive responses no-store', async () => {
    const { client, pins, headers } = setup('MANAGER');
    await client.state({ academyId });
    await client.generate({ academyId, expectedVersion: null });
    await client.reveal({ academyId, expectedVersion: version });
    expect(pins.generate).toHaveBeenCalledWith(academyId, null);
    expect(headers).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
  });
});


// Policy tests retain mutable relation doubles; the SQL projection itself is
// exercised against PostgreSQL in academy-access-read.integration.spec.ts.
vi.mock('../authorization/academy-access-read.js', () => ({
  readAcademyPermission: async (prisma: PrismaService, authUserId: string, academyId: string) => {
    const user = await prisma.user.findUnique({ where: { authUserId }, select: { id: true, status: true } });
    if (!user) return null;
    const membership = await prisma.academyMembership.findUnique({
      where: { academyId_userId: { academyId, userId: user.id } },
      include: { academy: { select: { status: true } }, extraRoles: { select: { role: true } } },
    });
    const academy = await prisma.academy.findUnique({ where: { id: academyId }, select: { status: true, kind: true } });
    return { ...user, membership, academy };
  },
}));
