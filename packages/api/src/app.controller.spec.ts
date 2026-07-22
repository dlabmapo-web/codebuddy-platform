import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { AppController } from "./app.controller.js";
import type { PrismaService } from "./database/prisma.service.js";

function createController(checkConnection: () => Promise<void>): AppController {
  return new AppController({ checkConnection } as PrismaService);
}

describe("AppController", () => {
  it("returns liveness without querying the database", () => {
    const checkConnection = vi.fn<() => Promise<void>>();
    const controller = createController(checkConnection);

    expect(controller.getHealth()).toEqual({
      status: "ok",
      service: "cove-api",
    });
    expect(checkConnection).not.toHaveBeenCalled();
  });

  it("returns readiness when PostgreSQL is reachable", async () => {
    const controller = createController(vi.fn().mockResolvedValue(undefined));

    await expect(controller.getReadiness()).resolves.toEqual({
      status: "ok",
      service: "cove-api",
      database: "reachable",
    });
  });

  it("returns a sanitized service-unavailable error", async () => {
    const databaseError = new Error(
      "password=secret host=private-database.internal",
    );
    const controller = createController(vi.fn().mockRejectedValue(databaseError));

    try {
      await controller.getReadiness();
      throw new Error("Expected readiness to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(String(error)).not.toContain("secret");
      expect((error as ServiceUnavailableException).getResponse()).toEqual({
        statusCode: 503,
        code: "DATABASE_UNAVAILABLE",
        message: "Database is not ready",
      });
    }
  });
});
