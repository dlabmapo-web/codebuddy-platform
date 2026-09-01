import { describe, expect, it, afterEach, vi } from "vitest";

import { computeStreakDays } from "./platform-users.service.js";

/**
 * The streak, in the academy's own calendar.
 *
 * `StudentCourseLearningDay.localDate` is already the academy's day rather
 * than a UTC one — an evening class must not be split across two dates — so
 * "today" and "yesterday" have to be read in that zone too. A streak that
 * flickered depending on which time zone the operator reading it happened to
 * be in would be worse than no streak.
 */
describe("computeStreakDays", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function at(iso: string) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(iso));
  }

  it("is zero with nothing recorded", () => {
    at("2026-09-01T09:00:00+09:00");
    expect(computeStreakDays("Asia/Seoul", [])).toBe(0);
  });

  it("counts consecutive days ending today", () => {
    at("2026-09-01T09:00:00+09:00");
    expect(
      computeStreakDays("Asia/Seoul", [
        "2026-09-01",
        "2026-08-31",
        "2026-08-30",
      ]),
    ).toBe(3);
  });

  it("still counts a streak that ended yesterday", () => {
    // A student who worked last night and has not opened the app this morning
    // has not lost their streak. Anchoring only on today would tell them they
    // had, every morning.
    at("2026-09-01T09:00:00+09:00");
    expect(computeStreakDays("Asia/Seoul", ["2026-08-31", "2026-08-30"])).toBe(
      2,
    );
  });

  it("stops at the first gap", () => {
    at("2026-09-01T09:00:00+09:00");
    expect(
      computeStreakDays("Asia/Seoul", [
        "2026-09-01",
        "2026-08-30",
        "2026-08-29",
      ]),
    ).toBe(1);
  });

  it("is zero when the most recent day is older than yesterday", () => {
    at("2026-09-01T09:00:00+09:00");
    expect(computeStreakDays("Asia/Seoul", ["2026-08-28"])).toBe(0);
  });

  it("reads today in the academy's zone, not the reader's", () => {
    // At 2026-09-01T02:00Z it is already the 1st in Seoul (11:00) and still
    // 31 August in Los Angeles (19:00). The same row therefore counts in one
    // zone and not the other, which is the point: the zone that decides is the
    // academy's, because it is the calendar the seconds were counted against.
    at("2026-09-01T02:00:00Z");
    expect(computeStreakDays("Asia/Seoul", ["2026-09-01"])).toBe(1);
    expect(computeStreakDays("America/Los_Angeles", ["2026-08-31"])).toBe(1);
    // A day that has not started yet in the academy's zone starts no streak.
    expect(computeStreakDays("America/Los_Angeles", ["2026-09-01"])).toBe(0);
  });

  it("crosses a month boundary", () => {
    at("2026-09-01T09:00:00+09:00");
    expect(
      computeStreakDays("Asia/Seoul", [
        "2026-09-01",
        "2026-08-31",
        "2026-08-30",
        "2026-08-29",
      ]),
    ).toBe(4);
  });
});
