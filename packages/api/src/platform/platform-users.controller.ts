import {
  Catch,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Query,
  Res,
  UseFilters,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Response } from "express";
import { parsePlatformUsersQuery } from "@cove/shared";

import { RateLimitService } from "../academies/rate-limit.service.js";
import { SupabaseAuthService } from "../auth/supabase-auth.service.js";
import { AppException } from "../common/app-exception.js";
import { PlatformUsersService } from "./platform-users.service.js";

/**
 * Puts the stable error code in the response body.
 *
 * The same filter the content importer uses, and for the same reason: Nest's
 * default shape is `{ statusCode, message }` where the message is English
 * written for a developer, and the console renders errors in the reader's
 * language from the code. `PLATFORM_EXPORT_TOO_LARGE` has to arrive as itself
 * or an operator sees a failed download instead of "narrow the filter".
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
 * The one operation on the user directory that moves bytes.
 *
 * A plain controller rather than an oRPC procedure, exactly as the content
 * importer's is: the contract layer carries JSON, and a spreadsheet
 * base64-encoded into a JSON string is a third larger and gets decoded twice.
 * Everything else about users — the list, the account, the mutations — stays
 * an ordinary typed call.
 *
 * The query string is the directory's own, parsed by the same
 * `parsePlatformUsersQuery` the page and the retired lens redirects use. A
 * hand-edited export URL therefore degrades to a default exactly as a
 * hand-edited directory URL does, rather than erroring — and an operator can
 * take the address out of their browser and get the file it describes.
 */
@Controller("platform-users")
@UseFilters(AppExceptionFilter)
export class PlatformUsersController {
  constructor(
    private readonly users: PlatformUsersService,
    private readonly auth: SupabaseAuthService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Get("export")
  async export(
    @Res() response: Response,
    @Query() query: Record<string, string | string[] | undefined>,
    @Headers("authorization") authorization?: string,
  ): Promise<void> {
    const identity = await this.identify(authorization);
    // Ten a minute. Building one of these reads every matching account, so the
    // limit is about the database rather than about the file.
    this.rateLimit.assert(
      `platform-users-export:${identity.authUserId}`,
      10,
      60_000,
    );

    const file = await this.users.exportDirectory(identity, {
      ...parsePlatformUsersQuery(query),
      locale: first(query.locale) === "ko" ? "ko" : "en",
      // The browser's own zone, so the dates in the file match the dates on
      // the page it was downloaded from. Validated where it is used — an
      // unusable zone falls back to UTC rather than failing the download.
      timeZone: first(query.tz)?.slice(0, 64) ?? "UTC",
    });

    response
      .status(HttpStatus.OK)
      .setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      )
      // Built by `userExportFilename` from a closed set of parts — a role
      // slug, a date, a count — so nothing a person typed reaches this header.
      // Quoted anyway, so it stays unsplittable if that ever changes.
      .setHeader("Content-Disposition", `attachment; filename="${file.filename}"`)
      // The browser reads the filename out of the header rather than rebuilding
      // it, and a cross-origin fetch cannot see a header it is not offered.
      .setHeader("Access-Control-Expose-Headers", "Content-Disposition")
      .send(file.bytes);
  }

  private async identify(authorization?: string) {
    const token = authorization?.replace(/^Bearer\s+/i, "");
    if (!token) {
      throw new AppException("AUTHENTICATION_REQUIRED", HttpStatus.UNAUTHORIZED);
    }
    return this.auth.verifyAccessToken(token);
  }
}

/** Repeated parameters arrive as a string or an array, never as both. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
