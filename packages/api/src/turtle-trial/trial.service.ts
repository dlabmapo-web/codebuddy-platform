import { HttpException, Inject, Injectable, Logger, Optional, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { strToU8, zipSync } from 'fflate';
import {
  turtleCustomSource, turtleShapeSource, turtleRunnerSource, turtleProjectReadme,
  turtleHelperVersion, turtleStarters, turtleRunSeconds, turtleRunning,
  type TurtleSession, type TurtleRunInput,
} from '@cove/shared';
import { TrialStore, type TrialGrant } from './trial-store.js';
import { TrialRuntime } from './trial-runtime.js';
import { trialDigest, trialEqual, trialHash } from './trial-security.js';
import { TrialPins } from './trial-pins.js';
import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class TrialService {
  private readonly logger = new Logger(TrialService.name);
  constructor(@Inject(ConfigService) private readonly config: ConfigService, @Inject(TrialStore) private readonly store: TrialStore, @Inject(TrialRuntime) private readonly runtime: TrialRuntime,
    @Optional() @Inject(TrialPins) private readonly pins?: TrialPins,
    @Optional() @Inject(PrismaService) private readonly prisma?: PrismaService) {}
  enabled() { if (!this.config.get('TURTLE_TRIAL_ENABLED')) throw new ServiceUnavailableException('TRIAL_UNAVAILABLE'); }
  private version() { return this.config.get<string>('TURTLE_TRIAL_PIN_VERSION')!; }
  private owner(g: TrialGrant) { return 'trial:' + g.hash; }
  async challenge(ip: string) {
    this.enabled();
    await this.store.limit([['challenge:ip:' + this.ipHash(ip), 240, 600000], ['challenge:all', 1200, 60000]]);
    const value = randomBytes(16).toString('hex') + '.' + Date.now();
    return { nonce: value + '.' + trialDigest(value, this.config.get<string>('BFF_SHARED_SECRET')!) };
  }
  private ipHash(ip: string) { return trialDigest(ip, this.config.get<string>('TURTLE_TRIAL_PIN_PEPPER')!); }
  async access(pin: unknown, nonce: string, ip: string) {
    this.enabled();
    const [random, timestamp, signature] = nonce.split('.');
    if (!random || !timestamp || !signature || !/^[a-f0-9]{32}$/.test(random) ||
      !/^\d{13}$/.test(timestamp) || Number(timestamp) > Date.now() || Number(timestamp) < Date.now() - 600000 ||
      !trialEqual(signature, trialDigest(random + '.' + timestamp, this.config.get<string>('BFF_SHARED_SECRET')!)))
      throw new UnauthorizedException('CHALLENGE_EXPIRED');
    await this.store.limit([
      ['access:nonce:' + trialHash(nonce), 10, 600000],
      ['access:ip:' + this.ipHash(ip), 120, 600000], ['access:all', 600, 60000],
    ]);
    const normalized = typeof pin === 'string' ? pin.trim() : '';
    const managed = await this.pins?.resolve(normalized);
    if (managed) {
      await this.academy(managed.academyId);
      await this.runtime.ready();
      return this.store.issue(managed.version, managed.academyId);
    }
    if (this.config.get('TURTLE_TRIAL_LEGACY_PIN_ENABLED') !== true) throw new UnauthorizedException('INVALID_PIN');
    if (!/^[0-9]{6}$/.test(normalized) || !trialEqual(
      trialDigest(normalized, this.config.get<string>('TURTLE_TRIAL_PIN_PEPPER')!),
      this.config.get<string>('TURTLE_TRIAL_PIN_DIGEST'),
    )) throw new UnauthorizedException('INVALID_PIN');
    if (!await this.store.version(this.version())) throw new ServiceUnavailableException('TRIAL_UNAVAILABLE');
    await this.runtime.ready();
    return this.store.issue(this.version());
  }
  async grant(token: string): Promise<TrialGrant> {
    this.enabled();
    const g = await this.store.grant(token, this.version());
    if (!g) throw new UnauthorizedException('ACCESS_EXPIRED');
    if (g.academyId) await this.academy(g.academyId);
    else if (this.config.get('TURTLE_TRIAL_LEGACY_PIN_ENABLED') !== true) throw new UnauthorizedException('ACCESS_EXPIRED');
    return g;
  }
  private async academy(id: string) {
    const academy = await this.prisma?.academy.findUnique({ where: { id }, select: { id: true, name: true, status: true } });
    if (!academy || academy.status !== 'ACTIVE') throw new UnauthorizedException('ACCESS_EXPIRED');
    return { id: academy.id, name: academy.name };
  }
  async bootstrap(token: string) {
    const g = await this.grant(token);
    let session: TurtleSession | null = null;
    if (g.active) session = await this.recover(g, g.active);
    return { expiresAt: g.expiresAt, helperVersion: turtleHelperVersion, starters: turtleStarters, session, academy: g.academyId ? await this.academy(g.academyId) : null };
  }
  private async finish(g: TrialGrant, key: string, s: TurtleSession) {
    if (turtleRunning(s)) return;
    await this.runtime.request('/sessions/' + s.id, 'DELETE').catch(() => {});
    const charged = s.startedAt ? Math.ceil(((s.endedAt ?? Date.now()) - s.startedAt) / 1000) : 0;
    await this.store.settle(g, key, charged);
  }
  private async recover(g: TrialGrant, key: string) {
    const run = await this.store.run(g, key);
    if (!run) return null;
    let session: TurtleSession | null = null;
    if (run.id) {
      try { session = await this.runtime.request('/sessions/' + run.id); }
      catch (e) { if (!(e instanceof HttpException && e.getStatus() === 404)) throw e; }
    } else session = await this.runtime.lookup(this.owner(g), key);
    if (session) {
      if (!run.id) await this.store.bind(g, key, session.id);
      await this.finish(g, key, session);
    } else if (Date.now() - Number(run.reservedAt) > 60000 || run.id) {
      // Unknown outcomes are charged conservatively, never admitted twice.
      await this.store.settle(g, key, 120);
    }
    return session;
  }
  async start(token: string, input: TurtleRunInput) {
    const traceId = randomUUID(), began = performance.now();
    const g = await this.grant(token); const unlock = await this.store.lock(g);
    const authorizationMs = performance.now() - began;
    let reservationMs = 0;
    try {
      if (g.active) await this.recover(g, g.active);
      const fingerprint = trialHash(JSON.stringify(input));
      const reserving = performance.now();
      const reservation = await this.store.reserve(g, input.requestKey, fingerprint);
      reservationMs = performance.now() - reserving;
      if (reservation === 'EXISTING') {
        const run = await this.store.run(g, input.requestKey);
        const session = await this.recover(g, input.requestKey);
        if (session) return session;
        if (run?.settled === '1' || (run && Date.now() - Number(run.reservedAt) > 60000))
          throw new HttpException('RUN_ENDED', 409);
      }
      let s: TurtleSession;
      try {
        s = await this.runtime.request('/sessions', 'POST', {
          owner: this.owner(g), requestKey: input.requestKey,
          authorizationExpiresAt: g.expiresAt,
          files: { 'main.py': input.source, 'custom.py': turtleCustomSource, 'shape.py': turtleShapeSource, '_cove_trial_runner.py': turtleRunnerSource },
          entryPoint: '_cove_trial_runner.py', assets: [], width: 1024, height: 640,
          timeLimitSeconds: turtleRunSeconds, memoryLimitMb: 512, outputLimitBytes: 262144,
        }, traceId);
      } catch (error) {
        // A transport timeout can mean the broker accepted the run. Reconcile
        // through its idempotent owner/key lookup before deciding on a refund.
        const recovered = await this.runtime.lookup(this.owner(g), input.requestKey);
        if (!recovered) { await this.store.settle(g, input.requestKey, 0); throw error; }
        s = recovered;
      }
      try { await this.store.bind(g, input.requestKey, s.id); }
      catch (error) { await this.runtime.request('/sessions/' + s.id, 'DELETE').catch(() => {}); throw error; }
      try { await this.grant(token); }
      catch (error) { await this.runtime.request('/sessions/' + s.id, 'DELETE').catch(() => {}); throw error; }
      return s;
    } finally {
      await unlock().catch(() => {});
      // Fixed fields only; admission credentials, source and capabilities are never logged.
      this.logger.log(JSON.stringify({ event: 'turtle.start', traceId,
        authorizationMs: Math.round(authorizationMs), reservationMs: Math.round(reservationMs),
        durationMs: Math.round(performance.now() - began) }));
    }
  }
  async session(token: string, id: string, method = 'GET', text?: string) {
    const g = await this.grant(token); const key = await this.store.owned(g, id);
    if (!key) throw new HttpException('RUN_NOT_FOUND', 404);
    await this.store.limit([['session:' + g.hash, 180, 60000]]);
    if (method === 'DELETE') {
      const before = await this.recover(g, key);
      await this.runtime.request('/sessions/' + id, 'DELETE').catch(e => {
        if (!(e instanceof HttpException && e.getStatus() === 404)) throw e;
      });
      await this.store.settle(g, key, before?.startedAt ? Math.ceil((Date.now() - before.startedAt) / 1000) : 0);
      return {};
    }
    if (text !== undefined) return this.runtime.request('/sessions/' + id + '/input', 'POST', { text });
    const s = await this.recover(g, key);
    if (!s) throw new HttpException('RUN_ENDED', 404);
    return s;
  }
  async revoke(token: string) {
    const g = await this.store.grant(token, this.version());
    if (!g) return {};
    await this.store.revoke(g); // Revoke first: no request can renew the lease.
    if (g.active) {
      const run = await this.store.run(g, g.active);
      const s = run?.id ? { id: run.id } : await this.runtime.lookup(this.owner(g), g.active).catch(() => null);
      if (s) await this.runtime.request('/sessions/' + s.id, 'DELETE').catch(() => {});
    }
    return {};
  }
  async project(token: string, source: string) {
    const g = await this.grant(token);
    await this.store.limit([['project:' + g.hash, 20, 60000]]);
    return zipSync({
      'main.py': strToU8(source), 'custom.py': strToU8(turtleCustomSource),
      'shape.py': strToU8(turtleShapeSource), 'README.txt': strToU8(turtleProjectReadme),
    });
  }
}
