import { HttpException, HttpStatus } from "@nestjs/common";
import { appErrorFallbacks, type AppErrorCode } from "@cove/shared";

export class AppException extends HttpException {
  constructor(
    readonly code: AppErrorCode,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    message: string = appErrorFallbacks[code],
  ) {
    super(message, status);
  }
}
