import { ArgumentsHost, Body, Catch, Controller, ExceptionFilter, Logger, Param, Post, Put, Req, Res, UseFilters } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { dlabCampusSchema, dlabExternalId, dlabUserSchema } from '@cove/shared';
import { ConfigService } from '@nestjs/config';
import { isTrustedBffRequest, bearerToken } from '../../orpc/context.js';
import type { ApiEnvironment } from '../../config/env.schema.js';
import { DlabError } from './dlab-error.js';
import { secretEqual } from './dlab-state.service.js';
import { DlabSsoService } from './dlab-sso.service.js';
import { DlabSourceService } from './dlab-source.service.js';

const opaque = z.string().regex(/^[a-f0-9]{64}$/);
const begin = z.object({ binding: opaque, returnTo: z.string().max(1024).optional(), previousState: opaque.optional() });
const complete = z.object({ binding: opaque, state: opaque, code: z.string().min(1).max(2048).optional(), error: z.string().max(200).optional() });
const activate = z.object({ binding: opaque, ticket: opaque });
export function uniqueHeader(req: Request, name: string): string | null {
  if (req.rawHeaders.filter((_, i) => i % 2 === 0 && req.rawHeaders[i]!.toLowerCase() === name).length !== 1) return null;
  const value = req.headers[name];
  return typeof value === 'string' ? value : null;
}
@Catch()
export class DlabExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DlabExceptionFilter.name);
  catch(error: unknown, host: ArgumentsHost) {
    const req = host.switchToHttp().getRequest<Request>();
    const res = host.switchToHttp().getResponse<Response>();
    const requestId = z.uuid().safeParse(req.headers['x-request-id']);
    const status = error instanceof DlabError ? error.getStatus() : 503;
    const body = error instanceof DlabError ? error.getResponse() as object : { code: 'internal_error', message: 'integration_unavailable' };
    const reason = error instanceof DlabError && /^[a-z_]{1,80}$/.test(error.reason) ? error.reason : 'integration_unavailable';
    // Never log request URLs, bodies, headers, provider responses, or exception text.
    this.logger.warn({ status, reason, requestId: requestId.success ? requestId.data : undefined });
    res.setHeader('Cache-Control', 'no-store');
    res.status(status).json({ ...body, request_id: requestId.success ? requestId.data : randomUUID() });
  }
}
@Controller('internal/dlab-sso')
@UseFilters(DlabExceptionFilter)
export class DlabInternalController {
  constructor(private readonly sso: DlabSsoService) {}
  private trusted(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    if (!uniqueHeader(req, 'x-cove-bff-secret') || !isTrustedBffRequest(req)) throw new DlabError('unauthorized', 401);
  }
  @Post('transactions')
  async start(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() body: unknown) {
    this.trusted(req, res);
    const input = begin.safeParse(body);
    if (!input.success) throw new DlabError('invalid_request');
    return this.sso.start(input.data.binding, input.data.returnTo, input.data.previousState);
  }
  @Post('complete')
  async complete(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() body: unknown) {
    this.trusted(req, res);
    const input = complete.safeParse(body);
    if (!input.success) throw new DlabError('invalid_request');
    return this.sso.complete(input.data.code, input.data.state, input.data.binding, input.data.error);
  }
  @Post('activate')
  async activate(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() body: unknown) {
    this.trusted(req, res);
    const input = activate.safeParse(body);
    const token = uniqueHeader(req, 'authorization') && bearerToken(req);
    if (!input.success || !token) throw new DlabError('invalid_activation');
    return this.sso.activate(input.data.ticket, input.data.binding, token);
  }
}
@Controller('integrations/dlab/v1')
@UseFilters(DlabExceptionFilter)
export class DlabInboundController {
  constructor(private readonly config: ConfigService<ApiEnvironment, true>, private readonly source: DlabSourceService) {}
  private authorize(req: Request) {
    const expected = this.config.get('DLAB_INBOUND_SERVER_KEY', { infer: true });
    const header = uniqueHeader(req, 'authorization');
    if (!expected || !header || !secretEqual(`Bearer ${expected}`, header)) throw new DlabError('unauthorized', 401);
    if (!this.config.get('DLAB_SSO_ENABLED', { infer: true })) throw new DlabError('integration_unavailable', 503);
    if (!z.uuid().safeParse(uniqueHeader(req, 'x-request-id')).success) throw new DlabError('invalid_request_id', 400, 'X-Request-Id');
    const size = Buffer.byteLength(JSON.stringify(req.body ?? {}));
    if (size > 16384) throw new DlabError('payload_too_large');
  }
  @Put('campuses/:id')
  async campus(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    this.authorize(req);
    const input = dlabCampusSchema.safeParse(body);
    if (!dlabExternalId.safeParse(id).success || !input.success) throw new DlabError('invalid_campus');
    const record = await this.source.campus(id, input.data);
    return { ok: true, ...(record.academyId ? { id: record.academyId } : {}) };
  }
  @Put('users/:id')
  async user(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) {
    this.authorize(req);
    const input = dlabUserSchema.safeParse(body);
    if (!dlabExternalId.safeParse(id).success || !input.success) throw new DlabError('invalid_user');
    const record = await this.source.user(id, input.data);
    return { ok: true, ...(record.userId ? { id: record.userId } : {}) };
  }
}
