import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import { VideoService } from "./video.service.js";
import { videoReportQuerySchema } from "@cove/shared";
const academyId = "00000000-0000-4000-8000-000000000001";
const input = videoReportQuerySchema.parse({
  academyId,
  materialId: academyId,
  classId: "00000000-0000-4000-8000-000000000002",
});
function fixture(role = "TEACHER") {
  const identity = { authUserId: "auth" } as never;
  const db = {
    class: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ id: input.classId, name: "Class" }),
    },
    $transaction: vi.fn(async (run) => run(db)),
    $queryRaw: vi
      .fn()
      .mockResolvedValueOnce([
        {
          students: 1,
          notStarted: 1,
          inProgress: 0,
          completed: 0,
          filteredCount: 1,
        },
      ])
      .mockResolvedValueOnce([
        {
          userId: "learner",
          learnerName: "Student",
          watchedMs: 0,
          positionMs: null,
          completed: false,
          status: "NOT_STARTED",
          updatedAt: null,
        },
      ]),
  };
  const service = new VideoService(
    db as never,
    {} as never,
    {} as never,
    {} as never,
    new ConfigService({ VIDEO_LESSONS_ENABLED: true }),
  );
  const accessible = vi.spyOn(service, "accessible").mockResolvedValue({
    actor: { role, userId: "teacher" },
    row: {
      id: input.materialId,
      title: "Video",
      lecture: {
        courseModule: { course: { id: "course", title: "Course" } },
      },
    },
    lesson: {
      assetId: "asset",
      asset: { filename: "video.mp4", durationMs: 100000 },
    },
  } as never);
  return { db, service, accessible, identity };
}
describe("class video report authorization", () => {
  it("denies students before reading any other learner's progress", async () => {
    const { service, identity, db } = fixture("STUDENT");
    await expect(service.report(identity, input)).rejects.toMatchObject({
      status: 403,
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("pins a teacher's report to their assigned active class and course", async () => {
    const { service, identity, db, accessible } = fixture();
    const report = await service.report(identity, input);
    expect(accessible).toHaveBeenCalledWith(
      identity,
      expect.objectContaining({
        academyId,
        classId: input.classId,
        preview: false,
        resource: true,
      }),
    );
    const where = db.class.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({
      id: input.classId,
      academyId,
      status: "ACTIVE",
      courseAssignments: { some: { courseId: "course" } },
    });
    expect(JSON.stringify(where)).toContain("teacher");
    expect(JSON.stringify(where)).toContain("assistantTeachers");
    expect(report.rows[0].status).toBe("NOT_STARTED");
    expect(report.material.assetId).toBe("asset");
    expect(report.rows[0]).not.toHaveProperty("sessionId");
  });
  it("rejects an unassigned/cross-class report without reading progress", async () => {
    const { service, identity, db } = fixture();
    db.class.findFirst.mockResolvedValue(null);
    await expect(service.report(identity, input)).rejects.toMatchObject({
      status: 403,
    });
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
  it.each(["TEAM_LEAD", "MANAGER"])(
    "gives %s academy-wide reports without a teaching assignment",
    async (role) => {
      const { service, identity, db } = fixture(role);
      await service.report(identity, input);
      expect(db.class.findFirst.mock.calls[0][0].where).toEqual({
        id: input.classId,
        academyId,
        status: "ACTIVE",
        courseAssignments: { some: { courseId: "course" } },
      });
    },
  );
  it("propagates the existing material/class access denial", async () => {
    const { service, identity, accessible, db } = fixture();
    accessible.mockRejectedValue(new Error("Access denied"));
    await expect(service.report(identity, input)).rejects.toThrow(
      "Access denied",
    );
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
  it("keeps existing reports readable when tracking is disabled", async () => {
    const { service, identity } = fixture();
    vi.spyOn(service, "enabled").mockReturnValue(false);
    const report = await service.report(identity, input);
    expect(report.trackingAvailable).toBe(false);
    expect(report.summary.students).toBe(1);
  });
});
