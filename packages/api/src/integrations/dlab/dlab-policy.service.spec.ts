import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../database/prisma.service.js';
import type { DlabStateService } from './dlab-state.service.js';
import { DlabPolicyService } from './dlab-policy.service.js';

describe('DlabPolicyService.eligible', () => {
  it('reads every policy fact in one statement and opens no transaction', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]), $transaction: vi.fn(), dlabIdentity: { findFirst: vi.fn() }, dlabCampus: { findMany: vi.fn() } };
    const policy = new DlabPolicyService(prisma as unknown as PrismaService, {} as DlabStateService, new ConfigService({}) as never);
    await expect(policy.eligible('00000000-0000-4000-8000-000000000001')).resolves.toBeNull();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.dlabIdentity.findFirst).not.toHaveBeenCalled();
    expect(prisma.dlabCampus.findMany).not.toHaveBeenCalled();
  });
});
