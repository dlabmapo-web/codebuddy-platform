import { HttpException, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { TurtleBrowserRun, TurtleBrowserStart } from '@cove/shared';
import { TrialStore, type TrialGrant } from './trial-store.js';
import { TrialBrowserPolicy } from './browser-policy.js';
import { trialHash, trialPrefix } from './trial-security.js';

// Lease renewal and settlement are atomic, including Stop/renew races. Client
// timing and reported output never determine admission refunds or authority.
const finish = `
if redis.call('HGET',KEYS[2],'engine')~='browser' then return 0 end
if redis.call('HGET',KEYS[2],'settled')=='1' then return 0 end
local start=tonumber(redis.call('HGET',KEYS[2],'reservedAt'))
local lease=tonumber(redis.call('HGET',KEYS[2],'leaseUntil'))
local deadline=tonumber(redis.call('HGET',KEYS[2],'deadline'))
local charged=120
if start and lease and deadline then charged=math.max(0,math.min(120,math.ceil((math.min(tonumber(ARGV[2]),lease,deadline)-start)/1000))) end
redis.call('HSET',KEYS[2],'settled','1','state',ARGV[3],'leaseUntil',ARGV[2])
if redis.call('EXISTS',KEYS[1])==1 then
 redis.call('HINCRBY',KEYS[1],'used',-(120-charged))
 if redis.call('HGET',KEYS[1],'active')==ARGV[1] then redis.call('HSET',KEYS[1],'active','') end
end
return 1`;
const renew = `
if redis.call('GET',KEYS[3])=='1' then return 0 end
if redis.call('EXISTS',KEYS[1])==0 or redis.call('HGET',KEYS[1],'active')~=ARGV[1] then return 0 end
if redis.call('HGET',KEYS[2],'engine')~='browser' or redis.call('HGET',KEYS[2],'settled')=='1' then return 0 end
local now=tonumber(ARGV[2])
local lease=tonumber(redis.call('HGET',KEYS[2],'leaseUntil') or '0')
local deadline=tonumber(redis.call('HGET',KEYS[2],'deadline') or '0')
if lease<=now or deadline<=now then return 0 end
redis.call('HSET',KEYS[2],'leaseUntil',math.min(now+30000,deadline))
return 1`;

@Injectable()
export class TrialBrowserRuns {
  constructor(@Inject(TrialStore) private readonly store: TrialStore, @Inject(TrialBrowserPolicy) private readonly policy: TrialBrowserPolicy) {}
  async end(g: TrialGrant, key: string, expired = false) {
    const redis = await this.store.client();
    await redis.eval(finish, 2, this.store.grantKey(g.hash), this.store.runKey(g.hash, key), key, Date.now(), expired ? 'EXPIRED' : 'STOPPED');
  }
  async recover(g: TrialGrant, key: string): Promise<TurtleBrowserRun | null> {
    let record = await this.store.run(g, key);
    if (!record || record.engine !== 'browser' || !record.id) return null;
    const enabled = this.policy.profile(g);
    if (!record.settled && (!enabled || Number(record.leaseUntil) <= Date.now() || Number(record.deadline) <= Date.now())) {
      await this.end(g, key, true); record = (await this.store.run(g, key))!;
    }
    // Old grant metadata is retained for recovery even after the kill switch.
    const profile = enabled ?? { engine: 'browser' as const, profile: 'cove-browser-turtle-v1' as const, protocol: 1 as const, origin: g.browserOrigin!, runtimeId: g.browserRuntimeId!, helperVersion: 'cove-trial-v1' as const };
    const leaseUntil = Number(record.leaseUntil);
    return { engine: 'browser', id: record.id!, requestKey: key, state: record.state === 'ACTIVE' ? 'ACTIVE' : record.state === 'EXPIRED' ? 'EXPIRED' : 'STOPPED', expiresAt: Number(record.deadline), leaseUntil, leaseMs: Math.max(0, Math.min(30000, leaseUntil - Date.now())), profile };
  }
  async start(g: TrialGrant, input: TurtleBrowserStart) {
    const profile = this.policy.require(g);
    if (g.active) {
      const record = await this.store.run(g, g.active);
      if (record?.engine === 'browser') await this.recover(g, g.active);
    }
    const now = Date.now();
    await this.store.reserve(g, input.requestKey, trialHash(JSON.stringify(input)), { id: randomUUID(), profile: JSON.stringify(profile), deadline: Math.min(g.expiresAt, now + 120000), leaseUntil: Math.min(g.expiresAt, now + 30000) });
    const run = await this.recover(g, input.requestKey);
    if (!run || run.state !== 'ACTIVE') throw new HttpException('RUN_ENDED', 409);
    return run;
  }
  async owned(g: TrialGrant, id: string) {
    const key = await this.store.owned(g, id);
    if (!key || (await this.store.run(g, key))?.engine !== 'browser') throw new HttpException('RUN_NOT_FOUND', 404);
    return key;
  }
  async renew(g: TrialGrant, id: string) {
    this.policy.require(g);
    const key = await this.owned(g, id), redis = await this.store.client();
    const renewed = await redis.eval(renew, 3, this.store.grantKey(g.hash), this.store.runKey(g.hash, key), trialPrefix + 'browser:draining', key, Date.now());
    const run = await this.recover(g, key);
    if (!renewed || !run || run.state !== 'ACTIVE') throw new HttpException('RUN_ENDED', 409);
    return run;
  }
}
