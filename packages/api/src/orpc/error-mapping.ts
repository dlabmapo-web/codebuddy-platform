import { HttpException } from "@nestjs/common";
import { ORPCError } from "@orpc/server";

import { AppException } from "../common/app-exception.js";

const statusCodes: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  422: "UNPROCESSABLE_ENTITY",
  429: "TOO_MANY_REQUESTS",
};

export function toORPCError(error: unknown): ORPCError<string, unknown> {
  if (error instanceof ORPCError) return error;
  if (error instanceof HttpException) {
    const status = error.getStatus();
    const appCode = error instanceof AppException ? error.code : undefined;
    return new ORPCError(
      appCode ?? statusCodes[status] ?? "INTERNAL_SERVER_ERROR",
      {
        status,
        message: error.message,
        data: appCode ? { code: appCode } : undefined,
      },
    );
  }
  return new ORPCError("INTERNAL_SERVER_ERROR", { status: 500 });
}
