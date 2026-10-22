import { HttpException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TurtleSession } from '@cove/shared';

@Injectable()
export class TrialRuntime {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}
  async ready() {
    const health = await this.control('/health') as { ready?: boolean; pool?: string };
    if (!health.ready || health.pool !== 'trial') throw new ServiceUnavailableException('TRIAL_UNAVAILABLE');
  }
  private async control(path: string, method = 'GET', body?: unknown): Promise<unknown> {
    const base = this.config.get<string>('TURTLE_TRIAL_SERVICE_URL');
    const secret = this.config.get<string>('TURTLE_TRIAL_SERVICE_SECRET');
    if (!base || !secret) throw new ServiceUnavailableException('TRIAL_UNAVAILABLE');
    let response: Response;
    try {
      response = await fetch(base + path, {
        method, headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(45000), redirect: 'error',
      });
    } catch { throw new ServiceUnavailableException('TRIAL_UNAVAILABLE'); }
    if (!response.ok) {
      throw new HttpException(response.status === 429 ? { message: 'RUNTIME_BUSY', retryAfter: 10 } : 'RUNTIME_UNAVAILABLE', [404, 409, 429].includes(response.status) ? response.status : 503);
    }
    return response.json();
  }
  async request(path: string, method = 'GET', body?: unknown): Promise<TurtleSession> {
    const data = await this.control(path, method, body) as TurtleSession;
    // Never pass future broker-internal fields through to anonymous browsers.
    return { id: data.id, state: data.state, output: data.output, token: data.token,
      expiresAt: data.expiresAt, startedAt: data.startedAt, endedAt: data.endedAt, exitCode: data.exitCode,
      displayUrl: `${this.config.get<string>('TURTLE_TRIAL_PUBLIC_WS_URL')}/sessions/${data.id}/display` };
  }
  async lookup(owner: string, key: string) {
    try { return await this.request('/owners/' + encodeURIComponent(owner) + '?requestKey=' + encodeURIComponent(key)); }
    catch (e) { if (e instanceof HttpException && e.getStatus() === 404) return null; throw e; }
  }
}
