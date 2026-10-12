import { describe, it, expect } from "vitest";
import {
  creditVideoCheckpoint,
  mergeWatchedIntervals,
  watchedMilliseconds,
  reserveVideoSchema,
  videoMaxBytes,
} from "@cove/shared";
import { normalizeVideoCaption } from "./video-captions.js";
describe("video watch credit", () => {
  const sample = {
    intervals: [] as [number, number][],
    previousMs: 0,
    positionMs: 10000,
    elapsedMs: 10000,
    rate: 1,
    playing: true,
    seeking: false,
    durationMs: 60000,
    creditEnabled: true,
  };
  it("counts only unique duration and never joins a skipped gap", () => {
    expect(
      mergeWatchedIntervals(
        [
          [0, 10000],
          [20000, 30000],
        ],
        [5000, 15000],
      ),
    ).toEqual([
      [0, 15000],
      [20000, 30000],
    ]);
    expect(
      watchedMilliseconds(mergeWatchedIntervals([[0, 10000]], [0, 10000])),
    ).toBe(10000);
  });
  it("does not award credit for seeking to the end or teleporting across time", () => {
    expect(
      creditVideoCheckpoint({ ...sample, positionMs: 60000, seeking: true })
        .intervals,
    ).toEqual([]);
    expect(
      creditVideoCheckpoint({ ...sample, positionMs: 60000 }).intervals,
    ).toEqual([]);
    expect(
      creditVideoCheckpoint({ ...sample, positionMs: 8000, previousMs: 10000 })
        .intervals,
    ).toEqual([]);
  });
  it("bounds credit by wall time and allowed rate, including pause and stalls", () => {
    expect(
      watchedMilliseconds(
        creditVideoCheckpoint({ ...sample, rate: 2, positionMs: 20000 })
          .intervals,
      ),
    ).toBe(20000);
    for (const override of [
      { playing: false },
      { creditEnabled: false },
      { elapsedMs: 120000 },
    ])
      expect(
        creditVideoCheckpoint({ ...sample, ...override }).intervals,
      ).toEqual([]);
  });
  it("retains an independent resume position without granting credit", () => {
    const result = creditVideoCheckpoint({
      ...sample,
      positionMs: 50000,
      seeking: true,
    });
    expect(result.positionMs).toBe(50000);
    expect(result.intervals).toEqual([]);
  });
  it("accepts the 5GB bound using decimal bytes rather than a 32-bit integer", () => {
    const base = {
      academyId: "00000000-0000-4000-8000-000000000001",
      courseId: "00000000-0000-4000-8000-000000000002",
      lectureId: "00000000-0000-4000-8000-000000000003",
      requestKey: "00000000-0000-4000-8000-000000000004",
      filename: "original.mp4",
    };
    expect(
      reserveVideoSchema.parse({ ...base, byteSize: String(videoMaxBytes) })
        .byteSize,
    ).toBe("5000000000");
    expect(
      reserveVideoSchema.safeParse({
        ...base,
        byteSize: String(videoMaxBytes + 1),
      }).success,
    ).toBe(false);
  });
});
describe("private VTT captions", () => {
  it("normalizes bounded plain captions and drops comments", () => {
    expect(
      normalizeVideoCaption(
        "WEBVTT\n\nNOTE comment\n\n00:00.000 --> 00:01.000\nOriginal caption\n",
        2000,
      ),
    ).toBe("WEBVTT\n\n00:00.000 --> 00:01.000\nOriginal caption\n");
  });
  it("rejects executable content, invalid timing, styles and out-of-duration cues", () => {
    for (const cue of [
      "00:00.000 --> 00:01.000\n<script>alert(1)</script>",
      "00:01.000 --> 00:00.000\nOriginal",
      "00:00.000 --> 00:03.000\nOriginal",
      "STYLE\n::cue { color:red; }",
    ])
      expect(() => normalizeVideoCaption("WEBVTT\n\n" + cue, 2000)).toThrow();
  });
});
