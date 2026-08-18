import {
  Catch,
  Controller,
  Delete,
  Headers,
  HttpStatus,
  Post,
  Query,
  Req,
  UseFilters,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Request, Response } from "express";

import { RateLimitService } from "../academies/rate-limit.service.js";
import { SupabaseAuthService } from "../auth/supabase-auth.service.js";
import { AppException } from "../common/app-exception.js";
import { readBody } from "../profile/profile-image.controller.js";
import { AcademyMediaService } from "./academy-media.service.js";

@Catch(AppException)
class AcademyMediaExceptionFilter implements ExceptionFilter {
  catch(exception: AppException, host: ArgumentsHost): void {
    host.switchToHttp().getResponse<Response>()
      .status(exception.getStatus())
      .json({ code: exception.code, message: exception.message });
  }
}

@Controller("academy-media")
@UseFilters(AcademyMediaExceptionFilter)
export class AcademyMediaController {
  constructor(
    private readonly academyMedia: AcademyMediaService,
    private readonly auth: SupabaseAuthService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Post()
  async upload(
    @Req() request: Request,
    @Query("academyId") academyId: string,
    @Query("kind") kind: string,
    @Query("altText") altText?: string,
    @Query("decorative") decorative?: string,
    @Headers("authorization") authorization?: string,
  ) {
    const identity = await this.identify(authorization);
    this.rateLimit.assert(`academy-media:${identity.authUserId}`, 10, 60_000);
    if (!isUuid(academyId) || (kind !== "COVER" && kind !== "GALLERY")) {
      throw new AppException("ACADEMY_MEDIA_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    return this.academyMedia.upload(identity, {
      academyId,
      kind,
      altText: altText?.slice(0, 300) ?? null,
      isDecorative: decorative === "true",
      file: await readBody(request),
    });
  }

  @Delete()
  async remove(
    @Query("academyId") academyId: string,
    @Query("mediaId") mediaId: string,
    @Headers("authorization") authorization?: string,
  ) {
    const identity = await this.identify(authorization);
    if (!isUuid(academyId) || !isUuid(mediaId)) {
      throw new AppException("ACADEMY_MEDIA_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    return this.academyMedia.remove(identity, { academyId, mediaId });
  }

  private identify(authorization: string | undefined) {
    const token = authorization?.replace(/^Bearer\s+/i, "");
    if (!token) {
      throw new AppException("AUTHENTICATION_REQUIRED", HttpStatus.UNAUTHORIZED);
    }
    return this.auth.verifyAccessToken(token);
  }
}

function isUuid(value: string | undefined): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
