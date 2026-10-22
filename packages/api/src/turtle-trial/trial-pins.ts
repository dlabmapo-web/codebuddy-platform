import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { HttpException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TrialStore } from './trial-store.js';
import { trialDigest, trialPrefix } from './trial-security.js';

export const academyPinKey = (id: string) => trialPrefix + 'academy-pin:' + id;
const indexKey = (digest: string) => trialPrefix + 'pin-index:' + digest;
type Record = { version: string; updatedAt: string; digest: string; ciphertext: string; iv: string; tag: string };
const replace = `
local previous=redis.call('GET',KEYS[1])
local old=previous and cjson.decode(previous) or nil
if (old and old.version or '')~=ARGV[1] then return 'CHANGED' end
if redis.call('EXISTS',KEYS[2])==1 then return 'COLLISION' end
redis.call('SET',KEYS[2],ARGV[2])
redis.call('SET',KEYS[1],ARGV[3])
if old then redis.call('EXPIRE',ARGV[4]..old.digest,7200) end
return 'OK'`;

/** Durable registry; guest grants keep their existing short-lived storage. */
@Injectable()
export class TrialPins {
  constructor(@Inject(ConfigService) private readonly config: ConfigService, @Inject(TrialStore) private readonly store: TrialStore) {}
  available() { return !!this.config.get('TURTLE_TRIAL_ENABLED') && !!this.config.get('TURTLE_TRIAL_PIN_PEPPER'); }
  private key() {
    if (!this.available()) throw new HttpException('TRIAL_UNAVAILABLE', 503);
    return Buffer.from(hkdfSync('sha256', this.config.get<string>('TURTLE_TRIAL_PIN_PEPPER')!, '', 'cove-academy-turtle-pin-v1', 32));
  }
  private digest(pin: string) { return trialDigest('academy-pin:' + pin, this.config.get<string>('TURTLE_TRIAL_PIN_PEPPER')!); }
  private async record(academyId: string): Promise<Record | null> {
    this.key();
    const raw = await (await this.store.client()).get(academyPinKey(academyId));
    return raw ? JSON.parse(raw) as Record : null;
  }
  async state(academyId: string) {
    if (!this.available()) return { available: false, current: null };
    const record = await this.record(academyId);
    return { available: true, current: record ? { version: record.version, updatedAt: record.updatedAt } : null };
  }
  async resolve(pin: string) {
    if (!this.available() || !/^[0-9]{6}$/.test(pin)) return null;
    const redis = await this.store.client();
    const raw = await redis.get(indexKey(this.digest(pin)));
    if (!raw) return null;
    const index = JSON.parse(raw) as { academyId: string; version: string };
    const record = await this.record(index.academyId);
    return record?.version === index.version ? index : null;
  }
  async reveal(academyId: string, expectedVersion: string) {
    const record = await this.record(academyId);
    if (!record || record.version !== expectedVersion) throw new HttpException('PIN_CHANGED', 409);
    const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(record.iv, 'base64'));
    decipher.setAAD(Buffer.from(academyId + ':' + record.version));
    decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
    const pin = Buffer.concat([decipher.update(Buffer.from(record.ciphertext, 'base64')), decipher.final()]).toString('utf8');
    return { pin, current: { version: record.version, updatedAt: record.updatedAt } };
  }
  async generate(academyId: string, expectedVersion: string | null) {
    const key = this.key();
    const redis = await this.store.client();
    for (let attempt = 0; attempt < 32; attempt++) {
      const pin = randomInt(1000000).toString().padStart(6, '0');
      // Reserve the optional old operator code too, so its meaning is unambiguous.
      if (trialDigest(pin, this.config.get<string>('TURTLE_TRIAL_PIN_PEPPER')!) === this.config.get('TURTLE_TRIAL_PIN_DIGEST')) continue;
      const version = randomUUID(); const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(academyId + ':' + version));
      const record: Record = { version, updatedAt: new Date().toISOString(), digest: this.digest(pin),
        ciphertext: Buffer.concat([cipher.update(pin, 'utf8'), cipher.final()]).toString('base64'),
        iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
      const result = await redis.eval(replace, 2, academyPinKey(academyId), indexKey(record.digest), expectedVersion ?? '',
        JSON.stringify({ academyId, version }), JSON.stringify(record), trialPrefix + 'pin-index:');
      if (result === 'CHANGED') throw new HttpException('PIN_CHANGED', 409);
      if (result === 'OK') return { pin, current: { version, updatedAt: record.updatedAt } };
    }
    throw new HttpException('TRIAL_UNAVAILABLE', 503);
  }
}
