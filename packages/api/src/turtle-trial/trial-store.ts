import { HttpException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { randomBytes } from 'node:crypto';
import { trialHash, trialPrefix } from './trial-security.js';
import type { OnModuleDestroy } from '@nestjs/common';

export type BrowserGrantFields = { browserProfile: string; browserRuntimeId: string; browserOrigin: string };
export type TrialGrant = { hash: string; version: string; expiresAt: number; active: string; academyId?: string; device?: string } & Partial<BrowserGrantFields>;
export type TrialRun = { requestKey: string; fingerprint: string; id?: string; settled?: string; reservedAt: string; engine?: string; leaseUntil?: string; deadline?: string; state?: string; profile?: string };
// Each limit is [key, max, windowMs, increment]. Increment 0 only reads the
// counter, so a class is not charged for attempts that were never wrong.
const rateScript = `local wait=0
for i,key in ipairs(KEYS) do
 local inc=tonumber(ARGV[i*3])
 local count
 if inc>0 then
  count=redis.call('INCRBY',key,inc)
  if count==inc then redis.call('PEXPIRE',key,ARGV[i*3-1]) end
 else count=tonumber(redis.call('GET',key) or '0') end
 if count>tonumber(ARGV[i*3-2]) then wait=math.max(wait,redis.call('PTTL',key)) end
end
return wait`;
const reserveScript = `
if ARGV[5] and ARGV[5]~='' and redis.call('GET',KEYS[6])=='1' then return 'DISABLED' end
if redis.call('EXISTS',KEYS[1])==0 then return 'EXPIRED' end
if redis.call('EXISTS',KEYS[2])==1 then
 if redis.call('HGET',KEYS[2],'fingerprint')~=ARGV[2] then return 'CONFLICT' end
 return 'EXISTING'
end
local active=redis.call('HGET',KEYS[1],'active')
if active and active~='' then return 'ACTIVE' end
local limits=cjson.decode(ARGV[6])
if tonumber(redis.call('HGET',KEYS[1],limits.field) or '0')+120>limits.budget then return 'BUDGET' end
if tonumber(redis.call('GET',KEYS[3]) or '0')>=limits.minute or tonumber(redis.call('GET',KEYS[4]) or '0')>=limits.hour then return 'LIMIT' end
for i=3,4 do local n=redis.call('INCR',KEYS[i]); if n==1 then redis.call('EXPIRE',KEYS[i],i==3 and 60 or 3600) end end
redis.call('HINCRBY',KEYS[1],limits.field,120)
redis.call('HSET',KEYS[1],'active',ARGV[1])
redis.call('HSET',KEYS[2],'requestKey',ARGV[1],'fingerprint',ARGV[2],'reservedAt',ARGV[4])
if ARGV[5] and ARGV[5]~='' then
 local browser=cjson.decode(ARGV[5])
 redis.call('HSET',KEYS[2],'engine','browser','id',browser.id,'leaseUntil',browser.leaseUntil,'deadline',browser.deadline,'state','ACTIVE','profile',browser.profile)
 redis.call('SET',KEYS[5],browser.binding,'EXAT',ARGV[3])
end
redis.call('EXPIREAT',KEYS[2],ARGV[3])
return 'NEW'`;
// A server drawing occupies the shared guest slot, so its starts and drawing
// time stay tightly bounded. A browser drawing runs on the student's own
// device: it is bounded only against runaway clients, with its own counters
// and drawing-time field,
// so a busy lesson never uses up the full-Python allowance or the session.
export const trialRunLimits = {
  server: { minute: 12, hour: 60, budget: 1800, field: 'used' },
  browser: { minute: 30, hour: 900, budget: 7200, field: 'browserUsed' },
} as const;
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
  async limit(limits: Array<[key: string, max: number, windowMs: number, increment?: 0 | 1]>) {
    const r = await this.client();
    const wait = Number(await r.eval(rateScript, limits.length, ...limits.map(([key]) => trialPrefix + 'limit:' + key), ...limits.flatMap(([, count, ms, increment = 1]) => [count, ms, increment])));
    if (wait > 0) throw new HttpException({ message: 'RATE_LIMITED', retryAfter: Math.ceil(wait / 1000) }, 429);
  }
  async version(expected: string) {
    const r = await this.client();
    await r.set(trialPrefix + 'version', expected, 'NX');
    return await r.get(trialPrefix + 'version') === expected;
  }
  async issue(version: string, academyId = '', browser?: BrowserGrantFields, device = '') {
    const r = await this.client(); const token = randomBytes(32).toString('hex');
    const hash = trialHash(token); const expiresAt = Date.now() + 7200000;
    await r.multi().hset(this.grantKey(hash), { version, academyId, expiresAt, active: '', used: 0, device, ...browser })
      .expireat(this.grantKey(hash), Math.ceil(expiresAt / 1000) + 600).exec();
    return { token, expiresAt };
  }
  async grant(token: string, version: string): Promise<TrialGrant | null> {
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const r = await this.client(); const hash = trialHash(token);
    const g = await r.hgetall(this.grantKey(hash));
    if (!g.version || Number(g.expiresAt) <= Date.now()) return null;
    if (g.academyId) {
      const raw = await r.get(trialPrefix + 'academy-pin:' + g.academyId);
      if (!raw || JSON.parse(raw).version !== g.version) return null;
    } else if (g.version !== version || !await this.version(version)) return null;
    return { hash, version: g.version, academyId: g.academyId || undefined, device: g.device || undefined, expiresAt: Number(g.expiresAt), active: g.active ?? '', browserProfile: g.browserProfile, browserRuntimeId: g.browserRuntimeId, browserOrigin: g.browserOrigin };
  }
  async run(g: TrialGrant, key: string): Promise<TrialRun | null> {
    const r = await this.client(); const data = await r.hgetall(this.runKey(g.hash, key));
    return data.requestKey ? data as TrialRun : null;
  }
  async reserve(g: TrialGrant, key: string, fingerprint: string, browser?: { id: string; leaseUntil: number; deadline: number; profile: string }) {
    const r = await this.client();
    const starts = trialPrefix + (browser ? 'browser-starts:' : 'starts:');
    const keys = [this.grantKey(g.hash), this.runKey(g.hash, key), starts + 'minute:' + g.hash, starts + 'hour:' + g.hash];
    if (browser) keys.push(trialPrefix + 'session:' + browser.id, trialPrefix + 'browser:draining');
    const result = await r.eval(reserveScript, keys.length, ...keys,
      key, fingerprint, Math.ceil(g.expiresAt / 1000) + 600, Date.now(), browser ? JSON.stringify({ ...browser, binding: JSON.stringify({ hash: g.hash, key }) }) : '',
      JSON.stringify(browser ? trialRunLimits.browser : trialRunLimits.server));
    if (result === 'ACTIVE' || result === 'CONFLICT') throw new HttpException('RUN_CONFLICT', 409);
    if (result === 'DISABLED') throw new ServiceUnavailableException('BROWSER_RUNTIME_UNAVAILABLE');
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
