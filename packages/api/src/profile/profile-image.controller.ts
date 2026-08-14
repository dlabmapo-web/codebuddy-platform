import {
  Catch,
  Controller,
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
import { maxUploadBytes } from "@cove/shared";

import { SupabaseAuthService } from "../auth/supabase-auth.service.js";
import { RateLimitService } from "../academies/rate-limit.service.js";
import { AppException } from "../common/app-exception.js";
import { AcademyProfileService } from "./academy-profile.service.js";
import { ProfileService } from "./profile.service.js";

/**
 * Puts the stable error code in the response body.
 *
 * Nest's default shape is `{ statusCode, message }`, and the message is
 * English text written for a developer. The browser renders errors from the
 * code — "Choose an image smaller than 5 MB", in the reader's language — and
 * without this it would fall back to "Something went wrong" for every upload
 * failure. The oRPC routes already get this through their own error mapping.
 */
@Catch(AppException)
class AppExceptionFilter implements ExceptionFilter {
  catch(exception: AppException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response
      .status(exception.getStatus())
      .json({ code: exception.code, message: exception.message });
  }
}

/**
 * Profile-image uploads.
 *
 * A plain controller rather than an oRPC procedure, for the same reason the
 * submission stream is one: the contract model carries JSON, and five
 * megabytes of photo base64-encoded into a JSON string is a third larger and
 * has to be decoded twice. The browser posts the cropped blob as the raw
 * request body instead.
 *
 * The declared content type is not trusted anywhere below. `normalize` reads
 * the format from the leading bytes and then requires a decoder to agree.
 */
@Controller("profile-images")
@UseFilters(AppExceptionFilter)
export class ProfileImageController {
  constructor(
    private readonly profile: ProfileService,
    private readonly academyProfile: AcademyProfileService,
    private readonly auth: SupabaseAuthService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Post("global")
  async uploadGlobal(
    @Req() request: Request,
    @Headers("authorization") authorization?: string,
  ) {
    const identity = await this.identify(authorization);
    this.limitUpload(identity.authUserId, request.ip);
    const file = await readBody(request);
    return this.profile.uploadImage(identity, file);
  }

  @Post("academy")
  async uploadAcademy(
    @Req() request: Request,
    @Query("academyId") academyId: string,
    // Absent means "my own membership". A manager naming a membership is
    // authorized against the academy, never against the row they named.
    @Query("membershipId") membershipId?: string,
    @Headers("authorization") authorization?: string,
  ) {
    const identity = await this.identify(authorization);
    this.limitUpload(identity.authUserId, request.ip);
    if (!isUuid(academyId) || (membershipId && !isUuid(membershipId))) {
      throw new AppException("PROFILE_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    const file = await readBody(request);
    return this.academyProfile.uploadImage(
      identity,
      { academyId, membershipId },
      file,
    );
  }

  private async identify(authorization: string | undefined) {
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length).trim()
      : null;
    if (!token) {
      throw new AppException("AUTHENTICATION_REQUIRED", HttpStatus.UNAUTHORIZED);
    }
    return this.auth.verifyAccessToken(token);
  }

  private limitUpload(authUserId: string, ip: string | undefined): void {
    // Per-user is the meaningful boundary; the IP ceiling also slows token
    // rotation attacks without punishing a classroom behind one NAT.
    this.rateLimit.assert(`profile-image:user:${authUserId}`, 10, 60_000);
    this.rateLimit.assert(`profile-image:ip:${ip ?? "unknown"}`, 60, 60_000);
  }
}

/**
 * Reads the body with a hard byte ceiling.
 *
 * A declared oversized body is rejected before it is read. A sender that lies
 * is rejected as soon as the streamed byte count crosses the ceiling, while
 * the remaining bytes are drained so Nest can still return the JSON 413 body.
 */
export async function readBody(request: Request): Promise<Buffer> {
  const declaredLength = Number(request.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > maxUploadBytes) {
    throw new AppException(
      "PROFILE_IMAGE_TOO_LARGE",
      HttpStatus.PAYLOAD_TOO_LARGE,
    );
  }

  const chunks: Buffer[] = [];
  let total = 0;

  return new Promise<Buffer>((resolve, reject) => {
    let settled = false;
    const onData = (chunk: Buffer) => {
      if (settled) return;
      total += chunk.byteLength;
      if (total > maxUploadBytes) {
        settled = true;
        request.off("data", onData);
        request.off("end", onEnd);
        request.off("error", onError);
        request.resume();
        reject(
          new AppException(
            "PROFILE_IMAGE_TOO_LARGE",
            HttpStatus.PAYLOAD_TOO_LARGE,
          ),
        );
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    };
    const onError = () => {
      if (settled) return;
      settled = true;
      reject(new AppException("PROFILE_IMAGE_DECODE_FAILED"));
    };
    request.on("data", onData);
    request.on("end", onEnd);
    request.on("error", onError);
  });
}

function isUuid(value: string | undefined): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value);
}
