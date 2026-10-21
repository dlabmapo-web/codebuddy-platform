import { describe, expect, it } from 'vitest';
import { validateEnvironment } from '../../config/env.schema.js';
const base = { NODE_ENV: 'test', WEB_ORIGIN: 'http://localhost:3000', SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'fake-service-key', DATABASE_URL: 'postgresql://test:test@localhost/test', DIRECT_URL: 'postgresql://test:test@localhost/test' };
describe('DLAB environment validation', () => {
  it('defaults to disabled and an empty rollout cohort', () => expect(validateEnvironment(base)).toMatchObject({ DLAB_SSO_ENABLED: false, DLAB_SSO_ALLOWED_EXTERNAL_USER_IDS: [] }));
  it('refuses enabling without credentials, trusted BFF configuration, Redis and callback', () => {
    expect(() => validateEnvironment({ ...base, DLAB_SSO_ENABLED: 'true' })).toThrow(/DLAB_CLIENT_SECRET.*DLAB_INBOUND_SERVER_KEY.*DLAB_REDIRECT_URI.*BFF_SHARED_SECRET.*REDIS_URL/);
  });
  it('rejects redirect mismatch and arbitrary upstream hosts', () => {
    expect(() => validateEnvironment({ ...base, DLAB_OS_BASE_URL: 'https://evil.test' })).toThrow(/DLAB_OS_BASE_URL/);
    expect(() => validateEnvironment({ ...base, DLAB_SSO_ENABLED: 'true', DLAB_REDIRECT_URI: 'https://evil.test/sso/callback' })).toThrow(/DLAB_REDIRECT_URI/);
  });
  it('rejects reusing an inbound key as a privileged server secret', () => {
    expect(() => validateEnvironment({ ...base, DLAB_SSO_ENABLED: 'true', DLAB_CLIENT_SECRET: 'a'.repeat(32), DLAB_INBOUND_SERVER_KEY: 'a'.repeat(32) })).toThrow(/independent/);
  });
  it('accepts a configured local callback only when it matches the local site', () => {
    expect(validateEnvironment({ ...base, DLAB_SSO_ENABLED: 'true', DLAB_CLIENT_SECRET: 'a'.repeat(32), DLAB_INBOUND_SERVER_KEY: 'b'.repeat(32), DLAB_REDIRECT_URI: 'http://localhost:3000/sso/callback', BFF_SHARED_SECRET: 'c'.repeat(32), REDIS_URL: 'redis://localhost:6379', DLAB_SSO_ALLOWED_EXTERNAL_USER_IDS: 'student-1, student-2' })).toMatchObject({ DLAB_SSO_ENABLED: true, DLAB_SSO_ALLOWED_EXTERNAL_USER_IDS: ['student-1', 'student-2'] });
  });
  it('requires explicit rollout mode and never treats an empty allowlist as open admission', () => {
    const configured = { ...base, DLAB_SSO_ENABLED: 'true', DLAB_CLIENT_SECRET: 'a'.repeat(32), DLAB_INBOUND_SERVER_KEY: 'b'.repeat(32), DLAB_REDIRECT_URI: 'http://localhost:3000/sso/callback', BFF_SHARED_SECRET: 'c'.repeat(32), REDIS_URL: 'redis://localhost:6379' };
    expect(() => validateEnvironment(configured)).toThrow(/DLAB_SSO_ALLOWED_EXTERNAL_USER_IDS/);
    expect(validateEnvironment({ ...configured, DLAB_SSO_ROLLOUT_MODE: 'campus' })).toMatchObject({ DLAB_SSO_ROLLOUT_MODE: 'campus', DLAB_OS_BASE_URL: 'https://os.dlabcampus.com/v1' });
    expect(() => validateEnvironment({ ...configured, DLAB_SSO_ROLLOUT_MODE: 'all' })).toThrow(/DLAB_SSO_ROLLOUT_MODE/);
    expect(() => validateEnvironment({ ...configured, DLAB_OS_BASE_URL: 'https://dlab-os.onrender.com/v1' })).toThrow(/DLAB_OS_BASE_URL/);
  });

});
