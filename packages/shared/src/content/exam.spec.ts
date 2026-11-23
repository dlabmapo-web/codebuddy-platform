import { describe, expect, it } from "vitest";

import {
  attemptIsOpen,
  attemptTotal,
  computeDeadline,
  deadlineEndReason,
  examScheduleUpdateInputSchema,
  formatPoints,
  itemScore,
  periodState,
  resultsVisible,
} from "./exam.js";

const at = (iso: string) => new Date(iso);

describe("computeDeadline", () => {
  const startedAt = at("2026-11-20T10:00:00Z");
  it("is null with no limit and no period end", () => {
    expect(computeDeadline({ startedAt, timeLimitMinutes: null, closesAt: null })).toBeNull();
  });
  it("is start + limit", () => {
    expect(computeDeadline({ startedAt, timeLimitMinutes: 50, closesAt: null })).toEqual(at("2026-11-20T10:50:00Z"));
  });
  it("is the period end when that comes first", () => {
    const closesAt = at("2026-11-20T10:30:00Z");
    const deadline = computeDeadline({ startedAt, timeLimitMinutes: 50, closesAt })!;
    expect(deadline).toEqual(closesAt);
    expect(deadlineEndReason({ deadlineAt: deadline, closesAt })).toBe("PERIOD_CLOSED");
  });
  it("is the period end alone when there is no limit", () => {
    expect(computeDeadline({ startedAt, timeLimitMinutes: null, closesAt: at("2026-11-21T00:00:00Z") })).toEqual(at("2026-11-21T00:00:00Z"));
  });
  it("reports TIME_UP when the limit came first", () => {
    expect(deadlineEndReason({ deadlineAt: at("2026-11-20T10:50:00Z"), closesAt: at("2026-11-21T00:00:00Z") })).toBe("TIME_UP");
  });
});

describe("periodState", () => {
  const now = at("2026-11-20T10:00:00Z");
  it("is open with no dates (상시)", () => expect(periodState({ opensAt: null, closesAt: null, now })).toBe("OPEN"));
  it("is before the opening", () => expect(periodState({ opensAt: at("2026-11-20T11:00:00Z"), closesAt: null, now })).toBe("BEFORE"));
  it("is after the end, inclusive", () => expect(periodState({ opensAt: null, closesAt: now, now })).toBe("AFTER"));
  it("is open with only an end in the future", () => expect(periodState({ opensAt: null, closesAt: at("2026-11-20T12:00:00Z"), now })).toBe("OPEN"));
});

describe("attemptIsOpen", () => {
  const now = at("2026-11-20T10:00:00Z");
  it("is closed once ended", () => expect(attemptIsOpen({ endedAt: now, deadlineAt: null, now })).toBe(false));
  it("is closed exactly at the deadline", () => expect(attemptIsOpen({ endedAt: null, deadlineAt: now, now })).toBe(false));
  it("is open without a deadline", () => expect(attemptIsOpen({ endedAt: null, deadlineAt: null, now })).toBe(true));
});

describe("resultsVisible", () => {
  const now = at("2026-11-20T10:00:00Z");
  it("is hidden without a release", () => expect(resultsVisible({ resultsReleasedAt: null, now })).toBe(false));
  it("is hidden before a scheduled release", () => expect(resultsVisible({ resultsReleasedAt: at("2026-11-21T00:00:00Z"), now })).toBe(false));
  it("is shown after it", () => expect(resultsVisible({ resultsReleasedAt: at("2026-11-19T00:00:00Z"), now })).toBe(true));
});

describe("scores", () => {
  it("scales a fraction to the item's points", () => {
    expect(itemScore(1, 700)).toBe(700);
    expect(itemScore(0.5, 700)).toBe(350);
    expect(itemScore(1 / 3, 1000)).toBe(333);
  });
  it("caps and floors the fraction", () => {
    expect(itemScore(1.4, 500)).toBe(500);
    expect(itemScore(-1, 500)).toBe(0);
  });
  it("keeps pending as null", () => expect(itemScore(null, 500)).toBeNull());
  it("totals earned, possible and pending, unsubmitted counting 0", () => {
    expect(attemptTotal([
      { pointsHundredths: 2000, scoreHundredths: 2000, submitted: true },
      { pointsHundredths: 2000, scoreHundredths: null, submitted: true },
      { pointsHundredths: 6000, scoreHundredths: null, submitted: false },
    ])).toEqual({ earnedHundredths: 2000, possibleHundredths: 10000, pending: 1 });
  });
  it("formats points", () => {
    expect(formatPoints(700)).toBe("7");
    expect(formatPoints(650)).toBe("6.5");
    expect(formatPoints(625)).toBe("6.25");
  });
});

describe("schedule input", () => {
  const base = { academyId: crypto.randomUUID(), classId: crypto.randomUUID(), lectureId: crypto.randomUUID() };
  it("refuses a period that closes before it opens", () => {
    expect(examScheduleUpdateInputSchema.safeParse({ ...base, schedule: {
      opensAt: "2026-11-21T00:00:00Z", closesAt: "2026-11-20T00:00:00Z", resultsReleasedAt: null,
    } }).success).toBe(false);
  });
  it("accepts 상시", () => {
    expect(examScheduleUpdateInputSchema.safeParse({ ...base, schedule: { opensAt: null, closesAt: null, resultsReleasedAt: null } }).success).toBe(true);
  });
});
