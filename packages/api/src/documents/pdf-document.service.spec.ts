import { describe, it, expect, vi } from "vitest";
import type { PrismaService } from "../database/prisma.service.js";
import type { AcademyAccessService } from "../authorization/academy-access.service.js";
import type { AuditService } from "../academies/audit.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import type { PdfStorageService } from "./pdf-storage.service.js";
import { PdfDocumentService, lockPdfAsset } from "./pdf-document.service.js";
const identity = { authUserId: "auth" } as SupabaseIdentity;
const target = {
  academyId: "academy",
  courseId: "course",
  lectureId: "lecture",
  materialId: "material",
};
function setup() {
  const prisma = {
    material: { findFirst: vi.fn() },
    course: { findUnique: vi.fn() },
    pdfAsset: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    $queryRaw: vi.fn(),
  };
  const access = {
    requirePermission: vi
      .fn()
      .mockResolvedValue({ userId: "student", role: "STUDENT" }),
  };
  const storage = {
    sign: vi.fn().mockResolvedValue("signed"),
    remove: vi.fn().mockResolvedValue(true),
  };
  const audit = { write: vi.fn() };
  const service = new PdfDocumentService(
    prisma as unknown as PrismaService,
    access as unknown as AcademyAccessService,
    storage as unknown as PdfStorageService,
    audit as unknown as AuditService,
  );
  return { prisma, access, storage, service };
}
describe("PDF authorization and asset lifecycle", () => {
  it("checks every visibility ancestor and active enrollment before signing", async () => {
    const { service, prisma, storage, access } = setup();
    prisma.material.findFirst.mockResolvedValue(null);
    await expect(service.read(identity, target)).rejects.toMatchObject({
      code: "PDF_NOT_AVAILABLE",
    });
    expect(access.requirePermission).toHaveBeenCalledWith(
      "auth",
      "academy",
      "curriculum.read",
    );
    const query = JSON.stringify(prisma.material.findFirst.mock.calls[0]);
    expect(query).toContain('"isVisible":true');
    expect(query).toContain('"classAssignments"');
    expect(query).toContain('"enrollments"');
    expect(query).toContain('"STUDENT"');
    expect(query).toContain('"ACTIVE"');
    expect(query).toContain('"READY"');
    expect(storage.sign).not.toHaveBeenCalled();
  });
  it("requires review permission for a hidden author preview", async () => {
    const { service, prisma, access, storage } = setup();
    access.requirePermission.mockRejectedValue(new Error("denied"));
    await expect(
      service.read(identity, { ...target, preview: true }),
    ).rejects.toThrow("denied");
    expect(access.requirePermission).toHaveBeenCalledWith(
      "auth",
      "academy",
      "curriculum.review",
    );
    expect(prisma.material.findFirst).not.toHaveBeenCalled();
    expect(storage.sign).not.toHaveBeenCalled();
  });
  it("refuses assets claimed for deletion under the same row lock used by adoption", async () => {
    const { prisma } = setup();
    prisma.pdfAsset.findUnique.mockResolvedValue({
      id: "asset",
      state: "DELETING",
    });
    await expect(lockPdfAsset(prisma as never, "asset")).rejects.toMatchObject({
      code: "PDF_UPLOAD_EXPIRED",
    });
    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
  });
  it("does not delete a file that acquired a library or course reference", async () => {
    const { prisma, storage, service } = setup();
    prisma.pdfAsset.findMany.mockResolvedValue([
      { id: "asset", objectKey: "key" },
    ]);
    prisma.pdfAsset.findUnique.mockResolvedValue({
      id: "asset",
      state: "READY",
      _count: { documents: 1 },
    });
    Object.assign(prisma, {
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
    });
    await service.cleanup();
    expect(storage.remove).not.toHaveBeenCalled();
    expect(prisma.pdfAsset.update).not.toHaveBeenCalled();
  });
  it("retains DELETING state for a failed storage deletion so the next sweep retries", async () => {
    const { prisma, storage, service } = setup();
    prisma.pdfAsset.findMany.mockResolvedValue([
      { id: "asset", objectKey: "key" },
    ]);
    prisma.pdfAsset.findUnique.mockResolvedValue({
      id: "asset",
      state: "READY",
      _count: { documents: 0 },
    });
    storage.remove.mockResolvedValue(false);
    Object.assign(prisma, {
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
    });
    await service.cleanup();
    expect(prisma.pdfAsset.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: "asset" },
      data: { state: "DELETING" },
    });
    expect(storage.remove).toHaveBeenCalledWith("key");
  });
});
