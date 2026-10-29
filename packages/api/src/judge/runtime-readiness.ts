import { createHash } from 'node:crypto';
import { Redis } from 'ioredis';
import { z } from 'zod';
import type { RuntimeManifest } from '@cove/shared';

export const RUNTIME_READINESS_TTL_MS = 6000;
export const RUNTIME_HEALTH_POLL_MS = 2000;
export type BrokerReadiness = { ready: boolean };
type ReadinessRedis = { get(key: string): Promise<string | null>; pttl(key: string): Promise<number>; set(key: string, value: string, expiry: 'PX', ttl: number): Promise<unknown> };
export type ReadinessRedisProvider = () => Promise<ReadinessRedis>;
type Configuration = { get(key: string): unknown };
const attestationSchema = z.strictObject({ version: z.literal(1), manifestIdentity: z.string().regex(/^[a-f0-9]{64}$/),
  workerGeneration: z.uuid(), brokerGeneration: z.uuid().nullable(), ready: z.boolean(), observedAt: z.number().int().nonnegative() });
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}';
  return JSON.stringify(value);
}
export function manifestIdentity(manifest: RuntimeManifest): string { return createHash('sha256').update(canonical(manifest)).digest('hex'); }
export function readinessKey(manifest: RuntimeManifest, worker: string) { return `cove:grading:readiness:v1:${manifestIdentity(manifest)}:${worker}`; }
async function bounded<T>(task: Promise<T>, milliseconds = 1000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([task, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Readiness deadline')), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
export async function assertRuntimeReady(redis: ReadinessRedisProvider, manifest: RuntimeManifest, worker: string): Promise<void> {
  z.uuid().parse(worker);
  const key = readinessKey(manifest, worker);
  const [raw, ttl] = await bounded(redis().then(client => Promise.all([client.get(key), client.pttl(key)])));
  if (ttl <= 0 || ttl > RUNTIME_READINESS_TTL_MS) throw new Error('Missing readiness expiry');
  if (!raw || Buffer.byteLength(raw) > 2048) throw new Error('Missing runtime readiness');
  const value = attestationSchema.parse(JSON.parse(raw));
  const age = Date.now() - value.observedAt;
  if (!value.ready || !value.brokerGeneration || value.workerGeneration !== worker || value.manifestIdentity !== manifestIdentity(manifest)
    || age < -1000 || age > RUNTIME_READINESS_TTL_MS) throw new Error('Unavailable runtime readiness');
}
const clients = new WeakMap<Configuration, Redis>();
/** API has read-only application Redis authority; it never opens the broker socket. */
export async function requireRuntimeReadiness(config: Configuration, manifest: RuntimeManifest, existingRedis?: ReadinessRedisProvider): Promise<void> {
  await assertRuntimeReady(existingRedis ?? (async () => {
    let client = clients.get(config);
    if (!client || client.status === 'end') {
      const url = config.get('REDIS_URL'); if (typeof url !== 'string') throw new Error('Missing readiness Redis');
      client = new Redis(url, { lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 0,
        connectTimeout: 750, commandTimeout: 750, retryStrategy: () => null });
      client.on('error', () => undefined); clients.set(config, client);
      await client.connect();
    }
    return client;
  }), manifest, String(config.get('GRADING_WORKER_GENERATION') ?? ''));
}
/** Private worker heartbeat, bound to the immutable manifest and expected incarnation. */
export class RuntimeReadinessPublisher {
  private healthPending: Promise<unknown> | null = null;
  private publishPending: Promise<unknown> | null = null;
  constructor(private readonly manifest: RuntimeManifest, private readonly worker: string, private readonly redis: ReadinessRedisProvider,
    private readonly health: (signal: AbortSignal) => Promise<{ brokerGeneration: string; workerGeneration: string | null; capabilities: RuntimeManifest['capabilities'] }>) {}
  async poll(redisReady: boolean): Promise<BrokerReadiness> {
    if (this.healthPending || this.publishPending) return { ready: false };
    const observedAt = Date.now(); let brokerGeneration: string | null = null, ready = false;
    const abort = new AbortController();
    const task = this.health(abort.signal); this.healthPending = task;
    void task.finally(() => { this.healthPending = null; }).catch(() => undefined);
    try {
      const health = await bounded(task);
      brokerGeneration = z.uuid().parse(health.brokerGeneration);
      ready = redisReady && health.workerGeneration === this.worker && canonical(health.capabilities) === canonical(this.manifest.capabilities);
    } catch { ready = false; } finally { abort.abort(); }
    const value = attestationSchema.parse({ version: 1, manifestIdentity: manifestIdentity(this.manifest), workerGeneration: this.worker, brokerGeneration, ready, observedAt });
    const write = this.redis().then(client => client.set(readinessKey(this.manifest, this.worker), JSON.stringify(value), 'PX', RUNTIME_READINESS_TTL_MS));
    this.publishPending = write;
    void write.finally(() => { this.publishPending = null; }).catch(() => undefined);
    try { await bounded(write); } catch { return { ready: false }; }
    return { ready };
  }
}
