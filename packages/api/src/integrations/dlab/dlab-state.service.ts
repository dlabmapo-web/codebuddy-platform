import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { MONITORING_REDIS, type MonitoringRedis } from '../../monitoring/monitoring.tokens.js';
import { DlabError } from './dlab-error.js';

export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function secretEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
const consume = `
local v = redis.call('GET', KEYS[1])
if not v then return false end
local parsed = cjson.decode(v)
if parsed.binding ~= ARGV[1] then return false end
redis.call('DEL', KEYS[1])
return v
`;
@Injectable()
export class DlabStateService {
  constructor(@Inject(MONITORING_REDIS) private readonly redis: MonitoringRedis) {}
  optionalRedis() { return this.redis; }
  requireRedis() {
    if (!this.redis) throw new DlabError('sso_unavailable', 503);
    return this.redis;
  }
  async issue(kind: string, binding: string, data: object, ttl = 300) {
    const token = randomBytes(32).toString('hex');
    await this.requireRedis().set(`cove:dlab:${kind}:${digest(token)}`, JSON.stringify({ ...data, binding: digest(binding) }), 'EX', ttl, 'NX');
    return token;
  }
  async consume<T>(kind: string, token: string, binding: string): Promise<T> {
    const result = await this.requireRedis().eval(consume, 1, `cove:dlab:${kind}:${digest(token)}`, digest(binding));
    if (typeof result !== 'string') throw new DlabError('invalid_or_expired_attempt');
    return JSON.parse(result) as T;
  }
  async invalidate(kind: string, token: string, binding: string) {
    await this.consume(kind, token, binding).catch(() => undefined);
  }
  async lock<T>(externalId: string, run: (assertOwned: () => Promise<void>) => Promise<T>): Promise<T> {
    const redis = this.requireRedis(), key = `cove:dlab:lock:${digest(externalId)}`, owner = randomBytes(32).toString('hex');
    if (await redis.set(key, owner, 'EX', 60, 'NX') !== 'OK') throw new DlabError('provisioning_busy', 503);
    const assertOwned = async () => { if (await redis.get(key) !== owner) throw new DlabError('provisioning_lock_lost', 503); };
    try { return await run(assertOwned); }
    finally { await redis.eval("if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0", 1, key, owner); }
  }
}

/** `recheck` asks every live session to re-verify; `recheck:<authUserId>,…` only
 * those accounts'. Operator tooling publishes the plain form. */
export function dlabRecheckMessage(authUserIds: readonly string[]): string {
  return `recheck:${[...new Set(authUserIds)].join(',')}`;
}
/** The accounts a message names, or null when it addresses everyone. Anything
 * unrecognised addresses everyone, so an unknown sender can only over-check. */
export function dlabRecheckTargets(message: string): ReadonlySet<string> | null {
  if (!message.startsWith('recheck:')) return null;
  const ids = message.slice('recheck:'.length).split(',').filter(Boolean);
  return ids.length ? new Set(ids) : null;
}
