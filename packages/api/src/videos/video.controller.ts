import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { Readable } from "node:stream";
import { z } from "zod";
import {
  reserveVideoSchema,
  saveVideoSchema,
  videoTargetSchema,
  videoReadSchema,
  videoCheckpointSchema,
} from "@cove/shared";
import { SupabaseAuthService } from "../auth/supabase-auth.service.js";
import { StudentSessionService } from "../auth/student-session.service.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { RateLimitService } from "../academies/rate-limit.service.js";
import { VideoService } from "./video.service.js";
import { VideoStorage } from "./video-storage.js";
const uploadTarget = videoTargetSchema.extend({ assetId: z.uuid() });
const querySchema = videoReadSchema.extend({
  preview: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  resource: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new BadRequestException(
      result.error.issues.map((x) => x.message).join("; "),
    );
  return result.data;
}
@Controller("videos")
export class VideoController {
  constructor(
    private readonly videos: VideoService,
    private readonly storage: VideoStorage,
    private readonly auth: SupabaseAuthService,
    private readonly sessions: StudentSessionService,
    private readonly access: AcademyAccessService,
    private readonly limits: RateLimitService,
  ) {}
  private async identify(header?: string, media = false) {
    if (!header?.startsWith("Bearer ")) throw new UnauthorizedException();
    const identity = await this.auth.verifyAccessToken(header.slice(7));
    if (await this.access.isStudentAnywhere(identity.authUserId))
      await this.sessions.requireActive(identity);
    this.limits.assert(
      `video:${media ? "media" : "control"}:${identity.authUserId}`,
      media ? 600 : 120,
      60000,
    );
    return identity;
  }
  @Get("capabilities") capabilities() {
    return {
      enabled: this.videos.enabled(),
      maxBytes: String(
        Math.min(
          5000000000,
          Number(process.env.VIDEO_MAX_UPLOAD_BYTES ?? 5000000000),
        ),
      ),
    };
  }
  @Post("reserve") async reserve(
    @Body() body: unknown,
    @Headers("authorization") auth?: string,
  ) {
    return this.videos.reserve(
      await this.identify(auth),
      parse(reserveVideoSchema, body),
    );
  }
  @Post("finish") async finish(
    @Body() body: unknown,
    @Headers("authorization") auth?: string,
  ) {
    return this.videos.finish(
      await this.identify(auth),
      parse(uploadTarget, body),
    );
  }
  @Get("asset") async asset(
    @Query() query: unknown,
    @Headers("authorization") auth?: string,
  ) {
    return this.videos.status(
      await this.identify(auth),
      parse(uploadTarget, query),
    );
  }
  @Post("cancel") async cancel(
    @Body() body: unknown,
    @Headers("authorization") auth?: string,
  ) {
    return this.videos.cancel(
      await this.identify(auth),
      parse(uploadTarget, body),
    );
  }
  @Post("retry") async retry(
    @Body() body: unknown,
    @Headers("authorization") auth?: string,
  ) {
    return this.videos.retry(
      await this.identify(auth),
      parse(uploadTarget, body),
    );
  }
  @Post("caption") async caption(
    @Body() body: unknown,
    @Headers("authorization") auth?: string,
  ) {
    return this.videos.caption(
      await this.identify(auth),
      parse(
        uploadTarget.extend({
          language: z.string().max(35),
          label: z.string().max(80),
          content: z.string().max(2000000),
        }),
        body,
      ),
    );
  }
  @Post() async save(
    @Body() body: unknown,
    @Headers("authorization") auth?: string,
  ) {
    return this.videos.save(
      await this.identify(auth),
      parse(saveVideoSchema, body),
    );
  }
  @Post("visibility") async visibility(
    @Body() body: unknown,
    @Headers("authorization") auth?: string,
  ) {
    const data = parse(
      videoTargetSchema.extend({
        materialId: z.uuid(),
        isVisible: z.boolean(),
      }),
      body,
    );
    return this.videos.mutate(await this.identify(auth), data, data.isVisible);
  }
  @Delete() async remove(
    @Body() body: unknown,
    @Headers("authorization") auth?: string,
  ) {
    return this.videos.mutate(
      await this.identify(auth),
      parse(videoTargetSchema.extend({ materialId: z.uuid() }), body),
    );
  }
  @Get("resources")
  @Header("Cache-Control", "private, no-store")
  async resources(
    @Query() query: unknown,
    @Headers("authorization") auth?: string,
  ) {
    return this.videos.resources(
      await this.identify(auth),
      parse(querySchema, query),
    );
  }
  @Get() @Header("Cache-Control", "private, no-store") async read(
    @Query() query: unknown,
    @Headers("authorization") auth?: string,
  ) {
    return this.videos.read(
      await this.identify(auth),
      parse(querySchema, query),
    );
  }
  @Post("session") async session(
    @Body() body: unknown,
    @Headers("authorization") auth?: string,
  ) {
    return this.videos.session(
      await this.identify(auth),
      parse(videoReadSchema.required({ classId: true }), body),
    );
  }
  @Post("checkpoint") async checkpoint(
    @Body() body: unknown,
    @Headers("authorization") auth?: string,
  ) {
    return this.videos.checkpoint(
      await this.identify(auth),
      parse(videoCheckpointSchema, body),
    );
  }
  @Get("history") @Header("Cache-Control", "private, no-store") async history(
    @Query() query: unknown,
    @Headers("authorization") auth?: string,
  ) {
    return this.videos.history(
      await this.identify(auth),
      parse(
        querySchema
          .required({ classId: true })
          .extend({ userId: z.uuid().optional() }),
        query,
      ),
    );
  }
  @Get("media") async media(
    @Query() query: unknown,
    @Headers("authorization") auth: string | undefined,
    @Headers("range") range: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const identity = await this.identify(auth, true);
    const input = parse(
      querySchema.extend({
        assetId: z.uuid(),
        path: z.string().min(1).max(150),
      }),
      query,
    );
    const key = await this.videos.mediaKey(identity, input);
    if (range && !/^bytes=\d*-\d*$/.test(range))
      throw new BadRequestException("Only one valid byte range is supported");
    const abort = new AbortController();
    res.on("close", () => abort.abort());
    const upstream = await this.storage.get(
      key.key,
      range,
      abort.signal,
      key.bucket,
    );
    res.status(upstream.status);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("X-Content-Type-Options", "nosniff");
    for (const h of [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
    ])
      if (upstream.headers.has(h)) res.setHeader(h, upstream.headers.get(h)!);
    if (!upstream.ok && upstream.status !== 416) {
      await upstream.body?.cancel();
      res.status(502).end();
      return;
    }
    if (upstream.body)
      Readable.fromWeb(upstream.body as never)
        .on("error", () => res.destroy())
        .pipe(res);
    else res.end();
  }
}
