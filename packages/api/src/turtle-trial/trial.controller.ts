import { Body, Controller, Delete, Get, Headers, HttpException, Inject, Param, Post, Res, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { z } from 'zod';
import { turtleBodyBytes, turtleHelperVersion, turtleRunSchema, turtleSourceBytes } from '@cove/shared';
import { TrialService } from './trial.service.js';
import { trialEqual } from './trial-security.js';

@Controller('turtle-trial')
export class TrialController {
  constructor(@Inject(TrialService) private readonly service: TrialService, @Inject(ConfigService) private readonly config: ConfigService) {}
  private identify(secret?: string, token?: string) {
    if (!trialEqual(secret, this.config.get<string>('BFF_SHARED_SECRET'))) throw new UnauthorizedException('ACCESS_DENIED');
    return token ?? '';
  }
  private bounded(body: unknown) {
    if (Buffer.byteLength(JSON.stringify(body) ?? '') > turtleBodyBytes) throw new HttpException('SOURCE_TOO_LARGE', 413);
  }
  @Post('challenge') challenge(@Headers('x-cove-bff-secret') secret?: string, @Headers('x-cove-client-ip') ip?: string) {
    this.identify(secret); return this.service.challenge(ip ?? 'unknown');
  }
  @Post('access') access(@Body() body: unknown, @Headers('x-cove-bff-secret') secret?: string,
    @Headers('x-cove-turtle-nonce') nonce?: string, @Headers('x-cove-client-ip') ip?: string) {
    this.identify(secret); this.bounded(body);
    const parsed = z.object({ pin: z.unknown() }).strict().safeParse(body);
    return this.service.access(parsed.success ? parsed.data.pin : undefined, nonce ?? '', ip ?? 'unknown');
  }
  @Get('bootstrap') bootstrap(@Headers('x-cove-bff-secret') secret?: string, @Headers('x-cove-turtle-session') token?: string) {
    return this.service.bootstrap(this.identify(secret, token));
  }
  @Delete('access') revoke(@Headers('x-cove-bff-secret') secret?: string, @Headers('x-cove-turtle-session') token?: string) {
    return this.service.revoke(this.identify(secret, token));
  }
  @Post('runs') start(@Body() body: unknown, @Headers('x-cove-bff-secret') secret?: string, @Headers('x-cove-turtle-session') token?: string) {
    const grant = this.identify(secret, token); this.bounded(body);
    if (body && typeof body === 'object' && 'source' in body && typeof body.source === 'string' && Buffer.byteLength(body.source) > turtleSourceBytes)
      throw new HttpException('SOURCE_TOO_LARGE', 413);
    const parsed = turtleRunSchema.safeParse(body);
    if (!parsed.success) throw new HttpException(body && typeof body === 'object' && 'helperVersion' in body && body.helperVersion !== turtleHelperVersion ? 'HELPERS_CHANGED' : 'INVALID_REQUEST', body && typeof body === 'object' && 'helperVersion' in body && body.helperVersion !== turtleHelperVersion ? 409 : 400);
    return this.service.start(grant, parsed.data);
  }
  @Get('runs/:id') status(@Param('id') id: string, @Headers('x-cove-bff-secret') secret?: string, @Headers('x-cove-turtle-session') token?: string) {
    return this.service.session(this.identify(secret, token), this.id(id));
  }
  @Delete('runs/:id') stop(@Param('id') id: string, @Headers('x-cove-bff-secret') secret?: string, @Headers('x-cove-turtle-session') token?: string) {
    return this.service.session(this.identify(secret, token), this.id(id), 'DELETE');
  }
  @Post('runs/:id/input') input(@Param('id') id: string, @Body() body: unknown, @Headers('x-cove-bff-secret') secret?: string, @Headers('x-cove-turtle-session') token?: string) {
    const grant = this.identify(secret, token);
    const value = z.object({ text: z.string().refine(s => Buffer.byteLength(s) <= 4096) }).strict().safeParse(body);
    if (!value.success) throw new HttpException('INVALID_INPUT', 400);
    return this.service.session(grant, this.id(id), 'POST', value.data.text);
  }
  @Post('project') async project(@Body() body: unknown, @Headers('x-cove-bff-secret') secret: string | undefined,
    @Headers('x-cove-turtle-session') token: string | undefined, @Res() response: Response) {
    const grant = this.identify(secret, token); this.bounded(body);
    const parsed = z.object({ source: z.string().refine(s => Buffer.byteLength(s) <= turtleSourceBytes) }).strict().safeParse(body);
    if (!parsed.success) throw new HttpException('INVALID_REQUEST', 400);
    const bytes = await this.service.project(grant, parsed.data.source);
    response.setHeader('Content-Type', 'application/zip');
    response.setHeader('Content-Disposition', 'attachment; filename="cove-turtle.zip"');
    response.setHeader('Cache-Control', 'private, no-store');
    response.send(Buffer.from(bytes));
  }
  private id(id: string) { if (!z.uuid().safeParse(id).success) throw new HttpException('RUN_NOT_FOUND', 404); return id; }
}
