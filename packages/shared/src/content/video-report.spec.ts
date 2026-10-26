import { describe, expect, it } from "vitest";
import {
  videoReportQuerySchema,
  videoViewingStatus,
  videoWatchPercent,
} from "./video.js";
const id = "00000000-0000-4000-8000-000000000001";
describe("video viewing report contracts", () => {
  it("keeps completion separate from percent, including a completed 90% watch", () => {
    expect(videoWatchPercent(90000, 100000)).toBe(90);
    expect(videoViewingStatus({ watchedMs: 90000, completed: true })).toBe(
      "COMPLETED",
    );
    expect(videoViewingStatus({ watchedMs: 60000, completed: false })).toBe(
      "IN_PROGRESS",
    );
    expect(videoViewingStatus(null)).toBe("NOT_STARTED");
    expect(videoViewingStatus({ watchedMs: 0, completed: false })).toBe(
      "NOT_STARTED",
    );
  });
  it("guards invalid durations and caps corrupt or out-of-range measurements", () => {
    expect(videoWatchPercent(10, 0)).toBe(0);
    expect(videoWatchPercent(NaN, 100)).toBe(0);
    expect(videoWatchPercent(100, Infinity)).toBe(0);
    expect(videoWatchPercent(-1, 100)).toBe(0);
    expect(videoWatchPercent(200, 100)).toBe(100);
    expect(videoWatchPercent(89999, 100000)).toBe(89);
  });
  it("bounds report input and strips caller-supplied permission/asset overrides", () => {
    expect(
      videoReportQuerySchema.parse({
        academyId: id,
        materialId: id,
        classId: id,
        preview: true,
        assetId: id,
      }),
    ).toEqual({
      academyId: id,
      materialId: id,
      classId: id,
      page: 1,
      search: "",
      status: "ALL",
    });
    for (const override of [
      { page: 0 },
      { page: 1.5 },
      { page: 100001 },
      { search: "x".repeat(129) },
      { status: "UNKNOWN" },
    ])
      expect(
        videoReportQuerySchema.safeParse({
          academyId: id,
          materialId: id,
          classId: id,
          ...override,
        }).success,
      ).toBe(false);
  });
});
