import type { Request } from "express";
import {
  Controller,
  Req,
  Get,
  Post,
  Delete,
  Body,
  Query,
  Param,
  Headers,
  Header,
  BadRequestException,
  UnauthorizedException,
} from "@nestjs/common";
import { z } from "zod";
import {
  saveManualSchema,
  manualTargetSchema,
  manualWorkSchema,
  manualSubmitSchema,
  manualReviewSchema,
} from "@cove/shared";
import { SupabaseAuthService } from "../auth/supabase-auth.service.js";
import { StudentSessionService } from "../auth/student-session.service.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { RateLimitService } from "../academies/rate-limit.service.js";
import { ManualService } from "./manual.service.js";
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const x = schema.safeParse(value);
  if (!x.success)
    throw new BadRequestException(
      x.error.issues.map((i) => i.message).join("; "),
    );
  return x.data;
}
@Controller("manual")
export class ManualController {
  constructor(
    private readonly service: ManualService,
    private readonly auth: SupabaseAuthService,
    private readonly sessions: StudentSessionService,
    private readonly access: AcademyAccessService,
    private readonly limits: RateLimitService,
  ) {}
  private async identify(header?: string) {
    if (!header?.startsWith("Bearer ")) throw new UnauthorizedException();
    const identity = await this.auth.verifyAccessToken(header.slice(7));
    if (await this.access.isStudentAnywhere(identity.authUserId))
      await this.sessions.requireActive(identity);
    this.limits.assert(`manual:${identity.authUserId}`, 120, 60000);
    return identity;
  }
  @Post("assets") async asset(
    @Req() request: Request,
    @Query() query: unknown,
    @Headers("authorization") auth?: string,
    @Headers("x-file-name") name?: string,
  ) {
    const target = parse(
      z.object({ academyId: z.uuid(), courseId: z.uuid() }),
      query,
    );
    return this.service.upload(
      await this.identify(auth),
      target,
      decodeURIComponent(name ?? ""),
      request,
    );
  }
  @Post() async save(
    @Body() body: unknown,
    @Headers("authorization") auth?: string,
  ) {
    return this.service.save(
      await this.identify(auth),
      parse(saveManualSchema, body),
    );
  }
  @Get() @Header("Cache-Control", "private, no-store") async read(
    @Query() query: unknown,
    @Headers("authorization") auth?: string,
  ) {
    const input = parse(
      manualTargetSchema.extend({
        preview: z.enum(["true", "false"]).optional(),
        classId: z.uuid().optional(),
      }),
      query,
    );
    return this.service.workspace(
      await this.identify(auth),
      input,
      input.preview === "true",
    );
  }
  @Post("visibility") async visibility(
    @Body() body: unknown,
    @Headers("authorization") auth?: string,
  ) {
    const input = parse(
      manualTargetSchema.extend({ isVisible: z.boolean() }),
      body,
    );
    return this.service.mutate(
      await this.identify(auth),
      input,
      input.isVisible,
    );
  }
  @Delete() async remove(
    @Body() body: unknown,
    @Headers("authorization") auth?: string,
  ) {
    return this.service.mutate(
      await this.identify(auth),
      parse(manualTargetSchema, body),
    );
  }
  @Post("draft") async draft(
    @Body() body: unknown,
    @Headers("authorization") auth?: string,
  ) {
    return this.service.draft(
      await this.identify(auth),
      parse(manualWorkSchema, body),
    );
  }
  @Post("submit") async submit(
    @Body() body: unknown,
    @Headers("authorization") auth?: string,
  ) {
    return this.service.submit(
      await this.identify(auth),
      parse(manualSubmitSchema, body),
    );
  }
  @Get("class-materials") async classMaterials(
    @Query() query: unknown,
    @Headers("authorization") auth?: string,
  ) {
    return this.service.classMaterials(
      await this.identify(auth),
      parse(z.object({ academyId: z.uuid(), classId: z.uuid() }), query),
    );
  }
  @Get("roster") async roster(
    @Query() query: unknown,
    @Headers("authorization") auth?: string,
  ) {
    return this.service.roster(
      await this.identify(auth),
      parse(
        manualTargetSchema.extend({
          classId: z.uuid(),
          userId: z.uuid().optional(),
        }),
        query,
      ),
    );
  }
  @Post("watch") async watch(
    @Body() body: unknown,
    @Headers("authorization") auth?: string,
  ) {
    return this.service.watch(
      await this.identify(auth),
      parse(
        manualTargetSchema.extend({ classId: z.uuid(), userId: z.uuid() }),
        body,
      ),
    );
  }
  @Get("watch/:id") async watchStatus(
    @Param("id") id: string,
    @Headers("authorization") auth?: string,
  ) {
    return this.service.watchStatus(
      await this.identify(auth),
      parse(z.uuid(), id),
    );
  }
  @Post("teacher-draft") async teacherDraft(
    @Body() body: unknown,
    @Headers("authorization") auth?: string,
  ) {
    return this.service.teacherDraft(
      await this.identify(auth),
      parse(
        manualWorkSchema.extend({ classId: z.uuid(), userId: z.uuid() }),
        body,
      ),
    );
  }
  @Get("reviews") @Header("Cache-Control", "private, no-store") async reviews(
    @Query() query: unknown,
    @Headers("authorization") auth?: string,
  ) {
    return this.service.listReviews(
      await this.identify(auth),
      parse(manualTargetSchema.extend({ classId: z.uuid() }), query),
    );
  }
  @Post("review") async review(
    @Body() body: unknown,
    @Headers("authorization") auth?: string,
  ) {
    return this.service.review(
      await this.identify(auth),
      parse(manualReviewSchema, body),
    );
  }
  @Post("sessions") async start(
    @Body() body: unknown,
    @Headers("authorization") auth?: string,
  ) {
    return this.service.start(
      await this.identify(auth),
      parse(
        manualWorkSchema.extend({
          contentRevision: z.number().int().positive(),
          preview: z.boolean().optional(),
          submissionId: z.uuid().optional(),
          solution: z.boolean().optional(),
        }),
        body,
      ),
    );
  }
  @Get("sessions/:id")
  @Header("Cache-Control", "private, no-store")
  async status(
    @Param("id") id: string,
    @Headers("authorization") auth?: string,
  ) {
    return this.service.session(await this.identify(auth), parse(z.uuid(), id));
  }
  @Delete("sessions/:id") async stop(
    @Param("id") id: string,
    @Headers("authorization") auth?: string,
  ) {
    return this.service.session(
      await this.identify(auth),
      parse(z.uuid(), id),
      "DELETE",
    );
  }
  @Post("sessions/:id/input") async input(
    @Param("id") id: string,
    @Body() body: unknown,
    @Headers("authorization") auth?: string,
  ) {
    const { text } = parse(z.object({ text: z.string().max(4096) }), body);
    return this.service.session(
      await this.identify(auth),
      parse(z.uuid(), id),
      "POST",
      text,
    );
  }
}
