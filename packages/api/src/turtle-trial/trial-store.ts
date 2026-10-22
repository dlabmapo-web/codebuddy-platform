import { HttpException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { randomBytes } from 'node:crypto';
import { trialHash, trialPrefix } from './trial-security.js';
import type { OnModuleDestroy } from '@nestjs/common';

export type TrialGrant = { hash: string; version: string; expiresAt: number; active: string };
export type TrialRun = { requestKey: string; fingerprint: string; id?: string; settled?: string; reservedAt: string };
const rateScript = `local wait=0
for i,key in ipairs(KEYS) do
 local count=redis.call('INCR',key)
 if count==1 then redis.call('PEXPIRE',key,ARGV[i*2]) end
 if count>tonumber(ARGV[i*2-1]) then wait=math.max(wait,redis.call('PTTL',key)) end
end
return wait`;
const reserveScript = `
if redis.call('EXISTS',KEYS[1])==0 then return 'EXPIRED' end
if redis.call('EXISTS',KEYS[2])==1 then
 if redis.call('HGET',KEYS[2],'fingerprint')~=ARGV[2] then return 'CONFLICT' end
 return 'EXISTING'
end
local active=redis.call('HGET',KEYS[1],'active')
if active and active~='' then return 'ACTIVE' end
if tonumber(redis.call('HGET',KEYS[1],'used') or '0')+120>1800 then return 'BUDGET' end
if tonumber(redis.call('GET',KEYS[3]) or '0')>=12 or tonumber(redis.call('GET',KEYS[4]) or '0')>=60 then return 'LIMIT' end
for i=3,4 do local n=redis.call('INCR',KEYS[i]); if n==1 then redis.call('EXPIRE',KEYS[i],i==3 and 60 or 3600) end end
redis.call('HINCRBY',KEYS[1],'used',120)
redis.call('HSET',KEYS[1],'active',ARGV[1])
redis.call('HSET',KEYS[2],'requestKey',ARGV[1],'fingerprint',ARGV[2],'reservedAt',ARGV[4])
redis.call('EXPIREAT',KEYS[2],ARGV[3])
return 'NEW'`;
const settleScript = `
if redis.call('EXISTS',KEYS[2])==0 or redis.call('HGET',KEYS[2],'settled')=='1' then return 0 end
redis.call('HSET',KEYS[2],'settled','1')
if redis.call('EXISTS',KEYS[1])==1 then
 redis.call('HINCRBY',KEYS[1],'used',-tonumber(ARGV[2]))
 if redis.call('HGET',KEYS[1],'active')==ARGV[1] then redis.call('HSET',KEYS[1],'active','') end
end
return 1`;

@Injectable()
export class TrialStore implements OnModuleDestroy {
  readonly redis: Redis | null;
  private connecting?: Promise<void>;
  constructor(@Inject(ConfigService) config: ConfigService) {
    const url = config.get<string>('REDIS_URL');
    this.redis = config.get('TURTLE_TRIAL_ENABLED') && url
      ? new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: true }) : null;
    this.redis?.on('error', () => {}); // Surface dependency errors as controlled 503s, without credentials.
  }
  async onModuleDestroy() { this.redis?.disconnect(); }
  async client(): Promise<Redis> {
    if (!this.redis) throw new ServiceUnavailableException('TRIAL_UNAVAILABLE');
    if (this.redis.status === 'wait' && !this.connecting)
      this.connecting = this.redis.connect().finally(() => { this.connecting = undefined; });
    if (this.connecting) await this.connecting;
    if (this.redis.status !== 'ready') throw new ServiceUnavailableException('TRIAL_UNAVAILABLE');
    return this.redis;
  }
  grantKey(hash: string) { return trialPrefix + 'grant:' + hash; }
  runKey(hash: string, key: string) { return trialPrefix + 'run:' + hash + ':' + key; }
  async limit(limits: Array<[string, number, number]>) {
    const r = await this.client();
    const wait = Number(await r.eval(rateScript, limits.length, ...limits.map(([key]) => trialPrefix + 'limit:' + key), ...limits.flatMap(([, count, ms]) => [count, ms])));
    if (wait > 0) throw new HttpException({ message: 'RATE_LIMITED', retryAfter: Math.ceil(wait / 1000) }, 429);
  }
  async version(expected: string) {
    const r = await this.client();
    await r.set(trialPrefix + 'version', expected, 'NX');
    return await r.get(trialPrefix + 'version') === expected;
  }
  async issue(version: string) {
    const r = await this.client(); const token = randomBytes(32).toString('hex');
    const hash = trialHash(token); const expiresAt = Date.now() + 7200000;
    await r.multi().hset(this.grantKey(hash), { version, expiresAt, active: '', used: 0 })
      .expireat(this.grantKey(hash), Math.ceil(expiresAt / 1000) + 600).exec();
    return { token, expiresAt };
  }
  async grant(token: string, version: string): Promise<TrialGrant | null> {
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const r = await this.client(); const hash = trialHash(token);
    const g = await r.hgetall(this.grantKey(hash));
    if (g.version !== version || Number(g.expiresAt) <= Date.now() || !await this.version(version)) return null;
    return { hash, version, expiresAt: Number(g.expiresAt), active: g.active ?? '' };
  }
  async run(g: TrialGrant, key: string): Promise<TrialRun | null> {
    const r = await this.client(); const data = await r.hgetall(this.runKey(g.hash, key));
    return data.requestKey ? data as TrialRun : null;
  }
  async reserve(g: TrialGrant, key: string, fingerprint: string) {
    const r = await this.client();
    const result = await r.eval(reserveScript, 4, this.grantKey(g.hash), this.runKey(g.hash, key),
      trialPrefix + 'starts:minute:' + g.hash, trialPrefix + 'starts:hour:' + g.hash,
      key, fingerprint, Math.ceil(g.expiresAt / 1000) + 600, Date.now());
    if (result === 'ACTIVE' || result === 'CONFLICT') throw new HttpException('RUN_CONFLICT', 409);
    if (result === 'EXPIRED') throw new HttpException('ACCESS_EXPIRED', 401);
    if (result === 'BUDGET' || result === 'LIMIT') throw new HttpException({ message: 'RUN_LIMIT', retryAfter: result === 'BUDGET' ? 7200 : 60 }, 429);
    return result;
  }
  async bind(g: TrialGrant, key: string, id: string) {
    const r = await this.client();
    await r.hset(this.runKey(g.hash, key), 'id', id);
    await r.set(trialPrefix + 'session:' + id, JSON.stringify({ hash: g.hash, key }), 'EXAT', Math.ceil(g.expiresAt / 1000) + 600);
  }
  async owned(g: TrialGrant, id: string) {
    const r = await this.client(); const binding = await r.get(trialPrefix + 'session:' + id);
    if (!binding) return null;
    const data = JSON.parse(binding) as { hash: string; key: string };
    return data.hash === g.hash ? data.key : null;
  }
  async settle(g: TrialGrant, key: string, charged: number) {
    const r = await this.client();
    await r.eval(settleScript, 2, this.grantKey(g.hash), this.runKey(g.hash, key), key, 120 - Math.min(120, Math.max(0, charged)));
  }
  async lock(g: TrialGrant) {
    const r = await this.client(); const token = randomBytes(16).toString('hex');
    if (await r.set(trialPrefix + 'lock:' + g.hash, token, 'PX', 60000, 'NX') !== 'OK') throw new HttpException('RUN_CONFLICT', 409);
    return async () => { await r.eval("if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0", 1, trialPrefix + 'lock:' + g.hash, token); };
  }
  async revoke(g: TrialGrant) { const r = await this.client(); await r.del(this.grantKey(g.hash)); }
}
