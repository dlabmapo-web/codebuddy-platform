import {
  Body,
  Catch,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  Post,
  Query,
  Req,
  UseFilters,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Request, Response } from "express";
import {
  pdfTargetSchema,
  pdfMaterialTargetSchema,
  savePdfSchema,
  pdfReadSchema,
} from "@cove/shared";
import { z } from "zod";
import { AppException } from "../common/app-exception.js";
import { StudentSessionService } from "../auth/student-session.service.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { SupabaseAuthService } from "../auth/supabase-auth.service.js";
import { RateLimitService } from "../academies/rate-limit.service.js";
import { PdfDocumentService } from "./pdf-document.service.js";
@Catch(AppException)
class PdfExceptionFilter implements ExceptionFilter {
  catch(error: AppException, host: ArgumentsHost) {
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(error.getStatus())
      .json({ code: error.code, message: error.message });
  }
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new AppException("PDF_INVALID");
  return result.data;
}
@Controller("documents")
@UseFilters(PdfExceptionFilter)
export class PdfDocumentController {
  constructor(
    private readonly documents: PdfDocumentService,
    private readonly auth: SupabaseAuthService,
    private readonly limits: RateLimitService,
    private readonly sessions: StudentSessionService,
    private readonly access: AcademyAccessService,
  ) {}
  private async identify(header?: string) {
    if (!header?.startsWith("Bearer "))
      throw new AppException("AUTHENTICATION_REQUIRED", 401);
    const identity = await this.auth.verifyAccessToken(header.slice(7).trim());
    if (await this.access.isStudentAnywhere(identity.authUserId))
      await this.sessions.requireActive(identity);
    return identity;
  }
  @Post("upload")
  async upload(
    @Req() request: Request,
    @Query() query: unknown,
    @Headers("authorization") header?: string,
    @Headers("x-file-name") name?: string,
  ) {
    const identity = await this.identify(header);
    this.limits.assert(`pdf:${identity.authUserId}`, 10, 60_000);
    const target = parse(pdfTargetSchema, query);
    let filename = "document.pdf";
    try {
      filename = decodeURIComponent(name ?? filename);
    } catch {
      throw new AppException("PDF_INVALID");
    }
    return this.documents.upload(identity, target, filename, request);
  }
  @Post()
  async save(@Body() body: unknown, @Headers("authorization") header?: string) {
    return this.documents.save(
      await this.identify(header),
      parse(savePdfSchema, body),
    );
  }
  @Post("visibility")
  async visibility(
    @Body() body: unknown,
    @Headers("authorization") header?: string,
  ) {
    const data = parse(
      pdfMaterialTargetSchema.extend({ isVisible: z.boolean() }),
      body,
    );
    return this.documents.mutate(
      await this.identify(header),
      data,
      data.isVisible,
    );
  }
  @Delete()
  async remove(
    @Body() body: unknown,
    @Headers("authorization") header?: string,
  ) {
    return this.documents.mutate(
      await this.identify(header),
      parse(pdfMaterialTargetSchema, body),
    );
  }
  @Get()
  @Header("Cache-Control", "private, no-store")
  async read(
    @Query() query: unknown,
    @Headers("authorization") header?: string,
  ) {
    const data = parse(
      pdfReadSchema.extend({
        download: z
          .enum(["true", "false"])
          .optional()
          .transform((v) => v === "true"),
      }),
      query,
    );
    return this.documents.read(await this.identify(header), data);
  }
}
