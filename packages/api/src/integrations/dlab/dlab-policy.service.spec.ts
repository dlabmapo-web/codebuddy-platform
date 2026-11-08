import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../database/prisma.service.js';
import { DlabPolicyService } from './dlab-policy.service.js';
import { dlabRecheckMessage, dlabRecheckTargets, type DlabStateService } from './dlab-state.service.js';

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

describe('DLAB recheck notices', () => {
  const policy = () => new DlabPolicyService({} as PrismaService, {} as DlabStateService, new ConfigService({}) as never);

  it('wakes every session for a plain recheck, as operator tooling publishes', () => {
    const p = policy(), a = vi.fn(), b = vi.fn(), anyone = vi.fn();
    p.watch(a, 'auth-a'); p.watch(b, 'auth-b'); p.watch(anyone);
    p.notify('recheck');
    expect([a, b, anyone].map(f => f.mock.calls.length)).toEqual([1, 1, 1]);
  });

  it('wakes only the named accounts, plus listeners that guard no account', () => {
    const p = policy(), a = vi.fn(), b = vi.fn(), anyone = vi.fn();
    p.watch(a, 'auth-a'); p.watch(b, 'auth-b'); p.watch(anyone);
    p.notify(dlabRecheckMessage(['auth-a', 'auth-a']));
    expect([a, b, anyone].map(f => f.mock.calls.length)).toEqual([1, 0, 1]);
  });

  it('treats an unrecognised or empty notice as addressed to everyone', () => {
    expect(dlabRecheckTargets('recheck:')).toBeNull();
    expect(dlabRecheckTargets('something-else')).toBeNull();
    expect([...dlabRecheckTargets('recheck:x,y')!]).toEqual(['x', 'y']);
  });

  it('stops notifying a listener once unwatched', () => {
    const p = policy(), a = vi.fn();
    const stop = p.watch(a, 'auth-a'); stop();
    p.notify('recheck');
    expect(a).not.toHaveBeenCalled();
  });
});
