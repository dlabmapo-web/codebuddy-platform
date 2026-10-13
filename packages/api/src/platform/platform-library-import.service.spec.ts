import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import { Prisma } from "../generated/prisma/client.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { PlatformLibraryImportService } from "./platform-library-import.service.js";

const identity = { authUserId: randomUUID() } as SupabaseIdentity;
const input = () => ({
  sourceAcademyId: randomUUID(),
  sourceCourseId: randomUUID(),
  expectedSourceContentRevision: 1,
  requestKey: randomUUID(),
  title: "Copy",
});
function setup(error: unknown) {
  const tx = vi.fn().mockRejectedValue(error);
  const receipt = vi.fn().mockResolvedValue(null);
  const platform = vi.fn().mockResolvedValue({ userId: randomUUID() });
  const source = vi.fn().mockResolvedValue({});
  const service = new PlatformLibraryImportService(
    { $transaction: tx, libraryCourseImport: { findUnique: receipt } } as never,
    { requirePermissions: platform } as never,
    { requirePermission: source } as never,
    {} as never,
    new ConfigService({ PLATFORM_ORGANIZATION_SLUG: "test" }) as never,
  );
  return { service, tx, receipt, platform, source };
}
const conflict = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError("test transaction error", {
    code,
    clientVersion: "7.9.0",
    meta,
  });

describe("library import authorization and retry bounds", () => {
  it.each([
    conflict("P2034"),
    conflict("P2002"),
    conflict("P2010", {
      driverAdapterError: {
        cause: { kind: "TransactionWriteConflict", originalCode: "40001" },
      },
    }),
    conflict("P2010", {
      driverAdapterError: { cause: { kind: "postgres", code: "40P01" } },
    }),
  ])(
    "bounds retryable database contention to three attempts",
    async (error) => {
      const { service, tx } = setup(error);
      await expect(
        service.importCourse(identity, input()),
      ).rejects.toMatchObject({ code: "LIBRARY_IMPORT_BUSY" });
      expect(tx).toHaveBeenCalledTimes(3);
    },
  );

  it("does not retry a validation or unexpected database failure", async () => {
    const failure = conflict("P2003");
    const { service, tx } = setup(failure);
    await expect(service.importCourse(identity, input())).rejects.toBe(failure);
    expect(tx).toHaveBeenCalledTimes(1);
  });

  it("checks platform capabilities before reading a source or receipt", async () => {
    const { service, tx, receipt, source, platform } = setup(new Error());
    platform.mockRejectedValue(new Error("permission denied"));
    await expect(service.importCourse(identity, input())).rejects.toThrow(
      "permission denied",
    );
    expect(receipt).not.toHaveBeenCalled();
    expect(source).not.toHaveBeenCalled();
    expect(tx).not.toHaveBeenCalled();
  });
});
