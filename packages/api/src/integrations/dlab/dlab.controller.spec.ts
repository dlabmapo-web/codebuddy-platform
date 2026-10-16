import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { Request, Response } from 'express';
import { DlabExceptionFilter, DlabInboundController, DlabInternalController } from './dlab.controller.js';
import { DlabError } from './dlab-error.js';
import type { DlabSourceService } from './dlab-source.service.js';
import type { DlabSsoService } from './dlab-sso.service.js';
const key = 'fake-inbound-key-for-tests-only-32-bytes';
const uuid = 'c7f0783b-f21e-4758-a9b8-0807bdb01c56';
function request(auth?: string, duplicates = false) {
  return { headers: { ...(auth ? { authorization: auth } : {}), 'x-request-id': uuid }, rawHeaders: [...(auth ? ['Authorization', auth] : []), ...(duplicates ? ['Authorization', auth!] : []), 'X-Request-Id', uuid], body: {} } as unknown as Request;
}
describe('DLAB incoming trust boundaries', () => {
  it('logs a safe reason without request or exception secrets', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const response = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn() };
    const req = { headers: { 'x-request-id': uuid, authorization: 'secret-header' }, url: '/callback?code=secret-code', body: { token: 'secret-token' } };
    const host = { switchToHttp: () => ({ getRequest: () => req, getResponse: () => response }) } as unknown as ArgumentsHost;
    try {
      const filter = new DlabExceptionFilter();
      filter.catch(new DlabError('code_exchange_failed'), host);
      expect(warn).toHaveBeenLastCalledWith({ status: 400, reason: 'code_exchange_failed', requestId: uuid });
      filter.catch(new Error('secret-exception'), host);
      expect(warn).toHaveBeenLastCalledWith({ status: 503, reason: 'integration_unavailable', requestId: uuid });
      expect(JSON.stringify(warn.mock.calls)).not.toContain('secret');
    } finally { warn.mockRestore(); }
  });
  it.each([undefined, 'Bearer wrong', `Basic ${key}`, `Bearer ${key} extra`])('rejects %j before parsing or storage', async auth => {
    const source = { campus: vi.fn(), user: vi.fn() };
    const controller = new DlabInboundController(new ConfigService({ DLAB_SSO_ENABLED: true, DLAB_INBOUND_SERVER_KEY: key }) as never, source as unknown as DlabSourceService);
    await expect(controller.campus(request(auth), 'x', null)).rejects.toMatchObject({ reason: 'unauthorized' });
    expect(source.campus).not.toHaveBeenCalled();
  });
  it('rejects duplicate Authorization headers', async () => {
    const controller = new DlabInboundController(new ConfigService({ DLAB_SSO_ENABLED: true, DLAB_INBOUND_SERVER_KEY: key }) as never, {} as DlabSourceService);
    await expect(controller.user(request(`Bearer ${key}`, true), 'x', {})).rejects.toMatchObject({ reason: 'unauthorized' });
  });
  it('requires a valid request ID after valid authentication', async () => {
    const req = request(`Bearer ${key}`); req.headers['x-request-id'] = 'invalid';
    const controller = new DlabInboundController(new ConfigService({ DLAB_SSO_ENABLED: true, DLAB_INBOUND_SERVER_KEY: key }) as never, {} as DlabSourceService);
    await expect(controller.campus(req, 'x', {})).rejects.toMatchObject({ reason: 'invalid_request_id' });
  });
  it('persists a valid authenticated user, including an unknown role', async () => {
    const source = { user: vi.fn().mockResolvedValue({ userId: null }) };
    const controller = new DlabInboundController(new ConfigService({ DLAB_SSO_ENABLED: true, DLAB_INBOUND_SERVER_KEY: key }) as never, source as unknown as DlabSourceService);
    const payload = { external_campus_id: 'campus', name: 'Test', user_role: 'future-role', account_status: 'active' };
    expect(await controller.user(request(`Bearer ${key}`), 'student', payload)).toEqual({ ok: true });
    expect(source.user).toHaveBeenCalledWith('student', payload);
  });
  it('does not let the inbound OS key mint sessions', async () => {
    const start = vi.fn();
    const controller = new DlabInternalController({ start } as unknown as DlabSsoService);
    await expect(controller.start(request(`Bearer ${key}`), { setHeader: vi.fn() } as unknown as Response, {})).rejects.toMatchObject({ reason: 'unauthorized' });
    expect(start).not.toHaveBeenCalled();
  });
});
