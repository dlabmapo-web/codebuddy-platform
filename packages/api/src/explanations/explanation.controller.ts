import { Catch, UseFilters, type ExceptionFilter, type ArgumentsHost, Body, Controller, Delete, Get, Header, Headers, Post, Query } from "@nestjs/common";
import { explanationReadSchema, explanationTargetSchema, saveExplanationSchema } from "@cove/shared";
import { z } from "zod";
import { AppException } from "../common/app-exception.js";
import { SupabaseAuthService } from "../auth/supabase-auth.service.js";
import { StudentSessionService } from "../auth/student-session.service.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { RateLimitService } from "../academies/rate-limit.service.js";
import { ExplanationService } from "./explanation.service.js";
@Catch(AppException)
class ExplanationExceptionFilter implements ExceptionFilter {
  catch(error: AppException, host: ArgumentsHost) {
    host.switchToHttp().getResponse<import('express').Response>().status(error.getStatus()).json({ code: error.code, message: error.message });
  }
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new AppException("CONTENT_VALIDATION_FAILED");
  return result.data;
}
const mutationSchema = explanationTargetSchema.extend({ materialId: z.uuid(), isVisible: z.boolean().optional() }).strict();
@Controller("explanations")
@UseFilters(ExplanationExceptionFilter)
export class ExplanationController {
  constructor(private readonly service: ExplanationService, private readonly auth: SupabaseAuthService,
    private readonly sessions: StudentSessionService, private readonly access: AcademyAccessService, private readonly limits: RateLimitService) {}
  private async identify(header?: string) {
    if (!header?.startsWith("Bearer ")) throw new AppException("AUTHENTICATION_REQUIRED", 401);
    const identity = await this.auth.verifyAccessToken(header.slice(7).trim());
    if (await this.access.isStudentAnywhere(identity.authUserId)) await this.sessions.requireActive(identity);
    this.limits.assert(`explanation:${identity.authUserId}`, 120, 60_000);
    return identity;
  }
  @Get("document") @Header("Cache-Control", "private, no-store")
  async document(@Query() query: unknown, @Headers("authorization") header?: string) {
    return this.service.authorDocument(await this.identify(header), parse(z.object({ academyId: z.uuid(), materialId: z.uuid() }).strict(), query));
  }
  @Get("context") @Header("Cache-Control", "private, no-store")
  async context(@Query() query: unknown, @Headers("authorization") header?: string) {
    return this.service.context(await this.identify(header), parse(explanationTargetSchema, query));
  }
  @Get() @Header("Cache-Control", "private, no-store")
  async read(@Query() query: unknown, @Headers("authorization") header?: string) {
    return this.service.read(await this.identify(header), parse(explanationReadSchema, query));
  }
  @Post()
  async save(@Body() body: unknown, @Headers("authorization") header?: string) {
    return this.service.save(await this.identify(header), parse(saveExplanationSchema, body));
  }
  @Post("visibility")
  async visibility(@Body() body: unknown, @Headers("authorization") header?: string) {
    return this.service.mutate(await this.identify(header), parse(mutationSchema.required({ isVisible: true }), body));
  }
  @Delete()
  async remove(@Body() body: unknown, @Headers("authorization") header?: string) {
    return this.service.mutate(await this.identify(header), parse(explanationTargetSchema.extend({ materialId: z.uuid() }).strict(), body));
  }
}
