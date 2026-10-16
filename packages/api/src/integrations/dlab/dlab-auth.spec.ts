import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { SupabaseAuthService } from '../../auth/supabase-auth.service.js';
import type { DlabPolicyService } from './dlab-policy.service.js';
import { DlabError } from './dlab-error.js';
function service(policy?: Partial<DlabPolicyService>) {
  const instance = new SupabaseAuthService(new ConfigService({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'fake-service-key' }) as never, policy as DlabPolicyService);
  const admin = { getUserById: vi.fn(), createUser: vi.fn(), generateLink: vi.fn(), updateUserById: vi.fn() };
  Object.defineProperty(instance, 'client', { value: { auth: { admin, getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: 'test-auth-id' } }, error: null }) } } });
  return { instance, admin };
}
describe('DLAB Supabase boundary', () => {
  it('creates a confirmed managed identity without a password', async () => {
    const { instance, admin } = service();
    admin.getUserById.mockResolvedValue({ error: { status: 404 } });
    admin.createUser.mockResolvedValue({ data: { user: { id: 'bound-id' } } });
    await instance.createDlabUser('bound-id', 'controlled@no-email.cove.invalid', 'Test');
    expect(admin.createUser).toHaveBeenCalledWith(expect.objectContaining({ id: 'bound-id', app_metadata: { dlab_managed: true }, email_confirm: true }));
    expect(admin.createUser.mock.calls[0]![0]).not.toHaveProperty('password');
  });
  it('does not adopt an unrelated existing auth user', async () => {
    const { instance, admin } = service();
    admin.getUserById.mockResolvedValue({ data: { user: { id: 'bound-id', email: 'someone@example.invalid', app_metadata: {} } } });
    await expect(instance.createDlabUser('bound-id', 'controlled@no-email.cove.invalid', 'Test')).rejects.toThrow('identity_conflict');
    expect(admin.createUser).not.toHaveBeenCalled();
  });
  it('never returns bridge material for a different user', async () => {
    const { instance, admin } = service();
    admin.generateLink.mockResolvedValue({ data: { user: { id: 'wrong-id' }, properties: { hashed_token: 'private' } } });
    await expect(instance.dlabTokenHash('bound-id', 'controlled@no-email.cove.invalid')).rejects.toThrow('session_bridge_failed');
  });
  it('rejects local password changes and suppresses password recovery for a managed account', async () => {
    const { instance, admin } = service({ managed: vi.fn().mockResolvedValue({}), forbidMutation: vi.fn().mockRejectedValue(new DlabError('dlab_managed_identity', 403)) });
    expect(await instance.describeIdentities('managed')).toEqual({ providers: ['dlab'], hasPasswordIdentity: false });
    expect(await instance.passwordIdentityStatus('managed')).toBe('absent');
    await expect(instance.setPassword('managed', 'unreachable-password')).rejects.toThrow();
    expect(admin.updateUserById).not.toHaveBeenCalled();
  });
  it('turns an unactivated managed session into the existing expired-token error', async () => {
    const { instance } = service({ assertSession: vi.fn().mockRejectedValue(new DlabError('session_not_activated', 401)) });
    await expect(instance.verifyAccessToken('fake-token')).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
  });
});
