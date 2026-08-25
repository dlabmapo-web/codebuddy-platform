import {
  Catch,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseFilters,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { CONTENT_IMPORT_MAX_UPLOAD_BYTES } from "@cove/shared";

import { RateLimitService } from "../../academies/rate-limit.service.js";
import { SupabaseAuthService } from "../../auth/supabase-auth.service.js";
import { AppException } from "../../common/app-exception.js";
import { ContentImportService } from "./content-import.service.js";

/**
 * Puts the stable error code in the response body.
 *
 * The same filter the member importer uses, and for the same reason: Nest's
 * default shape is `{ statusCode, message }` where the message is English
 * written for a developer, and the wizard renders errors in the reader's
 * language from the code. The `message` carries the specific workbook reason —
 * `too_many_sheets`, `formula_cell` — so the interface can name which problem
 * the file has rather than saying it has one.
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
 * The two operations that move bytes: the workbook up, and a workbook down.
 *
 * Plain controllers rather than oRPC procedures, exactly as §8 specifies. The
 * contract layer carries JSON, and ten megabytes of spreadsheet base64-encoded
 * into a JSON string is a third larger and gets decoded twice; a generated
 * workbook has the same problem in the other direction. Everything else —
 * preview, commit, result — is an ordinary typed call.
 *
 * Neither the declared content type nor the filename is trusted. The reader
 * sniffs the leading bytes and decides for itself, so a `.xlsx` that is really
 * a CSV is refused rather than parsed.
 */
@Controller("content-imports")
@UseFilters(AppExceptionFilter)
export class ContentImportController {
  constructor(
    private readonly imports: ContentImportService,
    private readonly auth: SupabaseAuthService,
    private readonly rateLimit: RateLimitService,
  ) {}

  /**
   * §4.3 — a workbook to start from.
   *
   * Both kinds require `content.import`, checked in the service: the
   * current-course export contains hidden test inputs and expected outputs, so
   * it is never reachable from a learner route or by a Manager reviewing
   * content.
   */
  @Get("template")
  async template(
    @Res() response: Response,
    @Query("academyId") academyId: string,
    @Query("courseId") courseId: string,
    @Query("kind") kind?: string,
    @Query("locale") locale?: string,
    @Query("moduleIds") moduleIds?: string | string[],
    @Query("lectureIds") lectureIds?: string | string[],
    @Headers("authorization") authorization?: string,
  ): Promise<void> {
    const identity = await this.identify(authorization);
    this.rateLimit.assert(`content-import-template:${identity.authUserId}`, 20, 60_000);

    const workbook = await this.imports.buildTemplate(identity, {
      academyId,
      courseId,
      kind: kind === "blank" ? "blank" : "current",
      locale: locale === "ko" ? "ko" : "en",
      moduleIds: toIdList(moduleIds),
      lectureIds: toIdList(lectureIds),
    });

    response
      .status(HttpStatus.OK)
      .setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      )
      // The filename is built from the course title by the shared generator,
      // which strips everything outside letters, numbers, `-`, and `_`. Quoting
      // it here as well means a header cannot be split even if that ever
      // changes.
      .setHeader(
        "Content-Disposition",
        `attachment; filename="${workbook.filename}"`,
      )
      .send(workbook.bytes);
  }

  /**
   * §4.2 — the upload, which produces a preview and changes nothing.
   *
   * The response is the stored preview, so the wizard moves straight to Review
   * without a second round trip.
   */
  @Post()
  async upload(
    @Req() request: Request,
    @Query("academyId") academyId: string,
    @Query("courseId") courseId: string,
    @Query("filename") filename?: string,
    @Headers("authorization") authorization?: string,
  ) {
    const identity = await this.identify(authorization);

    // §10 — bounded before the body is read, keyed by account. Parsing a
    // two-hundred-problem workbook is the most expensive work this API does on
    // one team lead's behalf.
    this.rateLimit.assert(`content-import-upload:${identity.authUserId}`, 10, 60_000);

    const bytes = await readBody(request);
    return this.imports.createPreview(identity, {
      academyId,
      courseId,
      // Display text and nothing else. It is capped, and it never reaches a
      // filesystem path or a shell.
      filename: (filename ?? "course.xlsx").slice(0, 255),
      bytes,
    });
  }

  private async identify(authorization?: string) {
    const token = authorization?.replace(/^Bearer\s+/i, "");
    if (!token) {
      throw new AppException("AUTHENTICATION_REQUIRED", HttpStatus.UNAUTHORIZED);
    }
    return this.auth.verifyAccessToken(token);
  }
}

/** Repeated query parameters arrive as a string or an array, never as both. */
function toIdList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const items = Array.isArray(value) ? value : value.split(",");
  return items.map((item) => item.trim()).filter((item) => item.length > 0);
}

/**
 * The request body, with the size cap enforced while it arrives.
 *
 * Counting bytes as they stream and destroying the socket on overflow is the
 * point: buffering the whole body and checking afterwards means a hostile
 * client has already made the process hold whatever it chose to send.
 */
async function readBody(request: Request): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;

  return new Promise<Buffer>((resolve, reject) => {
    request.on("data", (chunk: Buffer) => {
      total += chunk.byteLength;
      if (total > CONTENT_IMPORT_MAX_UPLOAD_BYTES) {
        request.destroy();
        reject(
          new AppException(
            "CONTENT_IMPORT_FILE_REJECTED",
            HttpStatus.PAYLOAD_TOO_LARGE,
            "file_too_large",
          ),
        );
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", () =>
      reject(
        new AppException(
          "CONTENT_IMPORT_FILE_REJECTED",
          HttpStatus.BAD_REQUEST,
          "unreadable",
        ),
      ),
    );
  });
}
