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
import { IMPORT_MAX_FILE_BYTES } from "@cove/shared";

import { RateLimitService } from "../academies/rate-limit.service.js";
import { SupabaseAuthService } from "../auth/supabase-auth.service.js";
import { AppException } from "../common/app-exception.js";
import { PeopleImportService } from "./people-import.service.js";

/**
 * Puts the stable error code in the response body.
 *
 * The same filter the profile-image controller uses, and for the same reason:
 * Nest's default shape is `{ statusCode, message }` where the message is
 * English written for a developer, and the browser renders errors from the
 * code in the reader's language. The `message` carries the specific workbook
 * reason — `too_many_rows`, `missing_required_column` — so the import wizard
 * can say which one rather than "that file could not be read".
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
 * The workbook upload.
 *
 * A plain controller rather than an oRPC procedure, exactly as profile-image
 * uploads are: the contract model carries JSON, and five megabytes of
 * spreadsheet base64-encoded into a JSON string is a third larger and has to be
 * decoded twice. The browser posts the file as the raw request body.
 *
 * Everything *after* the bytes — the preview, the commit, the result — is an
 * oRPC procedure, because all three are ordinary typed calls.
 *
 * Neither the declared content type nor the filename is trusted. The workbook
 * reader sniffs the leading bytes and decides for itself, so a `.csv` that is
 * really a zip is read as a zip and a `.xlsx` that is really text is read as
 * text.
 */
@Controller("people-imports")
@UseFilters(AppExceptionFilter)
export class PeopleImportController {
  constructor(
    private readonly imports: PeopleImportService,
    private readonly auth: SupabaseAuthService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Post()
  async upload(
    @Req() request: Request,
    @Query("academyId") academyId: string,
    @Query("filename") filename?: string,
    @Headers("authorization") authorization?: string,
  ) {
    const token = authorization?.replace(/^Bearer\s+/i, "");
    if (!token) {
      throw new AppException("AUTHENTICATION_REQUIRED", HttpStatus.UNAUTHORIZED);
    }
    const identity = await this.auth.verifyAccessToken(token);

    // §17 — bounded before the body is read, keyed by account. Parsing is the
    // most expensive work this API does on one manager's behalf.
    this.rateLimit.assert(`import-upload:${identity.authUserId}`, 10, 60_000);

    const bytes = await readBody(request);
    return this.imports.createPreview(identity, {
      academyId,
      // The filename is display text and nothing else. It is capped, and it
      // never reaches a filesystem path or a shell.
      filename: (filename ?? "members.csv").slice(0, 255),
      bytes,
    });
  }
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
      if (total > IMPORT_MAX_FILE_BYTES) {
        request.destroy();
        reject(
          new AppException(
            "IMPORT_FILE_REJECTED",
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
          "IMPORT_FILE_REJECTED",
          HttpStatus.BAD_REQUEST,
          "unreadable",
        ),
      ),
    );
  });
}
