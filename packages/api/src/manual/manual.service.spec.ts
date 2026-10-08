import { describe, it, expect, vi } from "vitest";
import { ManualService } from "./manual.service.js";
import type { PrismaService } from "../database/prisma.service.js";
import type { AcademyAccessService } from "../authorization/academy-access.service.js";
import type { AuditService } from "../academies/audit.service.js";
import type { GuiClientService } from "./gui-client.service.js";
import type { ManualAssetsService } from "./manual-assets.service.js";
import type { PointAwardService } from "../points/point-award.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
const identity = { authUserId: "auth-student" } as SupabaseIdentity;
const target = { academyId: "academy", materialId: "material" };
function fixture() {
  const config = {
    files: { "main.py": "print(1)" },
    solutionFiles: { "main.py": "PRIVATE" },
    modelAnswer: "PRIVATE_MODEL_ANSWER",
    assets: [],
    revision: 1,
    runtimeVersion: "image-v1",
  };
  const row = {
    id: "material",
    type: "TURTLE_EXERCISE",
    title: "Turtle",
    manualMaterial: config,
    lecture: { courseModule: { course: { id: "course", title: "Course" } } },
  };
  const actor = { role: "STUDENT", userId: "student" };
  const db = {
    material: { findFirst: vi.fn().mockResolvedValue(row) },
    course: { findUnique: vi.fn().mockResolvedValue({ modules: [] }) },
    class: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue({ id: "class" }),
    },
    manualDraft: { findUnique: vi.fn().mockResolvedValue(null) },
    manualSubmission: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    user: { findUnique: vi.fn().mockResolvedValue({ id: "intruder" }) },
    $transaction: vi.fn(),
  };
  const access = { requirePermission: vi.fn().mockResolvedValue(actor) },
    audit = { write: vi.fn() },
    gui = { request: vi.fn() },
    assets = { bytes: vi.fn() },
    points = { awardManualCompletion: vi.fn() };
  const service = new ManualService(
    db as unknown as PrismaService,
    access as unknown as AcademyAccessService,
    audit as unknown as AuditService,
    gui as unknown as GuiClientService,
    assets as unknown as ManualAssetsService,
    points as unknown as PointAwardService,
  );
  return { service, db, access, audit, gui, points };
}
describe("manual assessment boundaries", () => {
  it("projects only public attempt fields and omits private solutions for learners", async () => {
    const { service, db } = fixture();
    db.manualSubmission.findMany.mockResolvedValue([
      {
        id: "submission",
        userId: "student",
        classId: "class",
        files: { "main.py": "print(2)" },
        answer: "",
        createdAt: new Date(),
        maximumHundredths: 10000,
        includeInScore: true,
        reviewVersion: 0,
        reviews: [],
        profile: { solutionFiles: { "main.py": "SECRET_PROFILE" } },
      },
    ]);
    const result = await service.workspace(identity, target);
    expect(result.config.solutionFiles).toBeNull();
    expect(JSON.stringify(result)).not.toContain("PRIVATE");
    expect(JSON.stringify(result)).not.toContain("SECRET_PROFILE");
    expect(result.attempts[0]).not.toHaveProperty("profile");
  });
  it("applies all visibility ancestors and the assigned-course scope to direct URLs", async () => {
    const { service, db, access } = fixture();
    await service.workspace(identity, target);
    expect(access.requirePermission).toHaveBeenCalledWith(
      "auth-student",
      "academy",
      "curriculum.read",
    );
    const where = db.material.findFirst.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain("isVisible");
    expect(JSON.stringify(where)).toContain("enrollments");
    expect(where.type.in).toEqual(["TURTLE_EXERCISE", "WRITTEN_RESPONSE"]);
  });
  it("denies a guessed session id without cancelling its owner’s run", async () => {
    const { service, gui } = fixture();
    (service as unknown as { sessions: Map<string, unknown> }).sessions.set(
      "session",
      { target, userId: "owner", preview: false },
    );
    await expect(service.session(identity, "session")).rejects.toThrow();
    expect(gui.request).not.toHaveBeenCalled();
  });
  it("rejects stale reviews before publishing history, audit or awards", async () => {
    const { service, db, audit, points } = fixture();
    db.manualSubmission.findFirst.mockResolvedValue({
      id: "submission",
      materialId: "material",
      userId: "student",
      classId: "class",
      maximumHundredths: 10000,
    });
    db.manualSubmission.updateMany.mockResolvedValue({ count: 0 });
    db.$transaction.mockImplementation(async (callback) => callback(db));
    await expect(
      service.review(identity, {
        ...target,
        submissionId: "submission",
        expectedVersion: 0,
        scoreHundredths: 100,
        completed: true,
        feedback: "text",
      }),
    ).rejects.toThrow("Review changed");
    expect(audit.write).not.toHaveBeenCalled();
    expect(points.awardManualCompletion).not.toHaveBeenCalled();
  });
});
