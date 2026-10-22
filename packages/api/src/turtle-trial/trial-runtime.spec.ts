import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { TrialRuntime } from './trial-runtime.js';

const config = new ConfigService({ TURTLE_TRIAL_SERVICE_URL: 'http://private-guest:4010',
  TURTLE_TRIAL_SERVICE_SECRET: 'fixture-runtime-secret-never-production',
  TURTLE_TRIAL_PUBLIC_WS_URL: 'wss://cs.coveedu.com/turtle-display' });
afterEach(() => vi.unstubAllGlobals());
describe('guest broker boundary', () => {
  it('exposes only the session DTO, excluding future internal broker fields', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ id: 'fixture', state: 'RUNNING',
      output: 'hello', token: 'display-capability', expiresAt: 123, owner: 'private-owner',
      serviceSecret: 'must-not-pass-through', runtimeImage: 'internal-image' })));
    const session = await new TrialRuntime(config).request('/sessions/fixture');
    expect(session.displayUrl).toBe('wss://cs.coveedu.com/turtle-display/sessions/fixture/display');
    expect(session).not.toHaveProperty('owner'); expect(session).not.toHaveProperty('serviceSecret');
    expect(session).not.toHaveProperty('runtimeImage');
  });
  it('rejects a course broker and preserves bounded busy errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ready: true, pool: 'course' })));
    await expect(new TrialRuntime(config).ready()).rejects.toMatchObject({ status: 503 });
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ message: 'private diagnostic' }, { status: 429 })));
    await expect(new TrialRuntime(config).request('/sessions')).rejects.toMatchObject({ status: 429 });
  });
});
