import { describe, it, expect, vi } from "vitest";
import { ConfigService } from "@nestjs/config";
import { VideoService } from "./video.service.js";
const id = "00000000-0000-4000-8000-000000000001",
  assetId = "00000000-0000-4000-8000-000000000002",
  classId = "00000000-0000-4000-8000-000000000003";
function fixture(enabled = true) {
  const identity = { authUserId: "auth" } as never,
    actor = { userId: "user", role: "STUDENT" },
    asset = {
      id: assetId,
      academyId: id,
      state: "READY",
      filename: "original.mp4",
      byteSize: 300n,
      durationMs: 10000,
      failureCode: null,
      renditions: [{ height: 360, path: "encoded/revision/r360/index.m3u8" }],
      outputs: [
        "encoded/revision/master.m3u8",
        "encoded/revision/playback.mp4",
      ],
      objectKey: "PRIVATE_ORIGINAL",
      checksum: "PRIVATE_CHECKSUM",
    },
    lesson = {
      assetId,
      revision: 1,
      description: "",
      placement: "MAIN",
      includeInScore: true,
      maximumHundredths: 10000,
      thresholdBasisPoints: 9000,
      captions: [],
      assets: [],
      asset,
    },
    row = {
      id,
      type: "VIDEO_LESSON",
      title: "Original video",
      lectureId: id,
      videoLesson: lesson,
      lecture: {
        title: "Lecture",
        courseModule: { course: { id, title: "Course" } },
      },
    };
  const db = {
    material: { findFirst: vi.fn().mockResolvedValue(row) },
    class: {
      findFirst: vi.fn().mockResolvedValue({ id: classId }),
      findMany: vi.fn().mockResolvedValue([{ id: classId, name: "Class" }]),
    },
    course: { findUnique: vi.fn().mockResolvedValue({ modules: [] }) },
    videoWatchProgress: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    videoLesson: { findUniqueOrThrow: vi.fn().mockResolvedValue(lesson) },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation((run) => run(db));
  const access = { requirePermission: vi.fn().mockResolvedValue(actor) };
  const service = new VideoService(
    db as never,
    access as never,
    {} as never,
    {} as never,
    new ConfigService({ VIDEO_LESSONS_ENABLED: enabled }),
  );
  return { service, db, identity, asset, lesson, row, access, actor };
}
describe("video access and immutable progress boundaries", () => {
  it("whitelists learner media metadata without source keys or hashes", async () => {
    const { service, identity } = fixture();
    const read = await service.read(identity, {
      academyId: id,
      materialId: id,
      classId,
    });
    expect(read.asset.byteSize).toBe("300");
    expect(JSON.stringify(read)).not.toMatch(
      /PRIVATE_ORIGINAL|PRIVATE_CHECKSUM|objectKey/,
    );
    expect(read.asset.masterPath).toBe("encoded/revision/master.m3u8");
  });
  it("applies all ancestors and class/course enrollment to direct URLs", async () => {
    const { service, identity, db } = fixture();
    await service.read(identity, { academyId: id, materialId: id, classId });
    expect(JSON.stringify(db.material.findFirst.mock.calls[0])).toContain(
      "isVisible",
    );
    expect(JSON.stringify(db.material.findFirst.mock.calls[0])).toContain(
      "enrollments",
    );
    expect(JSON.stringify(db.class.findFirst.mock.calls[0])).toContain(
      "courseAssignments",
    );
    db.class.findFirst.mockResolvedValue(null as never);
    await expect(
      service.read(identity, { academyId: id, materialId: id, classId }),
    ).rejects.toThrow();
  });
  it("does not expose original objects or permit guessed/traversal media paths", async () => {
    const { service, identity } = fixture();
    for (const path of [
      "original.mp4",
      "../encoded/revision/playback.mp4",
      "encoded//revision/playback.mp4",
    ])
      await expect(
        service.mediaKey(identity, {
          academyId: id,
          materialId: id,
          assetId,
          classId,
          path,
        }),
      ).rejects.toThrow();
    expect(
      await service.mediaKey(identity, {
        academyId: id,
        materialId: id,
        assetId,
        classId,
        path: "encoded/revision/playback.mp4",
      }),
    ).toEqual({
      key: `${id}/${assetId}/encoded/revision/playback.mp4`,
      bucket: "course-videos",
    });
  });
  it("keeps flag-off published content readable while rejecting new watch sessions", async () => {
    const { service, identity } = fixture(false);
    expect(
      (await service.read(identity, { academyId: id, materialId: id, classId }))
        .trackingAvailable,
    ).toBe(false);
    await expect(
      service.session(identity, { academyId: id, materialId: id, classId }),
    ).rejects.toThrow("unavailable");
  });
  it("refuses a supplementary-only video as a standalone main lesson", async () => {
    const { service, identity, lesson } = fixture();
    lesson.placement = "SUPPLEMENTARY";
    await expect(
      service.read(identity, { academyId: id, materialId: id, classId }),
    ).rejects.toThrow();
    expect(
      (
        await service.read(identity, {
          academyId: id,
          materialId: id,
          classId,
          resource: true,
        })
      ).config.placement,
    ).toBe("SUPPLEMENTARY");
  });
  it("makes duplicate checkpoints idempotent and rejects replacement sessions", async () => {
    const { service, identity, db } = fixture();
    const sessionId = "00000000-0000-4000-8000-000000000004";
    const p = {
      positionMs: 1000,
      watchedMs: 1000,
      completed: false,
      sessionId,
      sequence: 2,
      previousPlaying: true,
      intervals: [[0, 1000]],
      thresholdBasisPoints: 9000,
      maximumHundredths: 10000,
      updatedAt: new Date(),
    };
    db.videoWatchProgress.findUnique.mockResolvedValue(p as never);
    const input = {
      academyId: id,
      materialId: id,
      classId,
      assetId,
      sessionId,
      sequence: 2,
      elapsedMs: 1000,
      positionMs: 9999,
      rate: 1,
      playing: true,
      seeking: false,
    };
    expect((await service.checkpoint(identity, input)).positionMs).toBe(1000);
    expect(db.videoWatchProgress.update).not.toHaveBeenCalled();
    await expect(
      service.checkpoint(identity, { ...input, sessionId: id, sequence: 3 }),
    ).rejects.toThrow("another tab");
    await expect(
      service.checkpoint(identity, { ...input, sequence: 4 }),
    ).rejects.toThrow("out of order");
  });
  it("credits natural playback to the threshold without counting a seek, including resources", async () => {
    const { service, identity, db, lesson } = fixture();
    lesson.placement = "SUPPLEMENTARY";
    lesson.includeInScore = false;
    const sessionId = "00000000-0000-4000-8000-000000000004";
    let progress = {
      positionMs: 0,
      watchedMs: 0,
      completed: false,
      sessionId,
      sequence: 0,
      sampleElapsedMs: 0,
      sessionStartedAt: new Date(Date.now() - 10000),
      previousPlaying: true,
      intervals: [],
      thresholdBasisPoints: 9000,
      maximumHundredths: 10000,
      updatedAt: new Date(Date.now() - 10000),
    };
    db.videoWatchProgress.findUnique.mockImplementation(
      async () => progress as never,
    );
    db.videoWatchProgress.update.mockImplementation(async ({ data }) => {
      progress = { ...progress, ...data };
      return progress;
    });
    const sample = {
      academyId: id,
      materialId: id,
      classId,
      assetId,
      sessionId,
      sequence: 1,
      elapsedMs: 0,
      positionMs: 9000,
      rate: 1,
      playing: false,
      seeking: true,
    };
    expect((await service.checkpoint(identity, sample)).watchedMs).toBe(0);
    progress = { ...progress, positionMs: 0, previousPlaying: true };
    const completed = await service.checkpoint(identity, {
      ...sample,
      sequence: 2,
      elapsedMs: 9000,
      seeking: false,
    });
    expect(completed.watchedMs).toBe(9000);
    expect(completed.completed).toBe(true);
    await expect(service.checkpoint(identity, {...sample, sequence: 3, elapsedMs: 1000000, seeking: false})).rejects.toThrow("Invalid playback clock");
    await expect(service.checkpoint(identity, {...sample, sequence: 3, elapsedMs: 8000, seeking: false})).rejects.toThrow("Invalid playback clock");
  });
});
