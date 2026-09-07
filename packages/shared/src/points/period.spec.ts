import { describe, expect, it } from "vitest";

import {
  DEFAULT_POINTS_PERIOD,
  POINTS_EPOCH_DATE,
  parsePointsPeriodKind,
  pointsPeriodKinds,
  previousPointsPeriod,
  resolvePointsPeriod,
} from "./period.js";

/** Midday in Seoul on a Wednesday, so nothing here straddles a date line. */
const NOW = new Date("2026-09-09T03:00:00.000Z");

describe("the all-time period", () => {
  it("is what a reader lands on", () => {
    expect(DEFAULT_POINTS_PERIOD).toBe("all");
    // Widest first: the selectors map this array, so it is also the order on
    // screen and the reason the default sits at the left end.
    expect(pointsPeriodKinds[0]).toBe("all");
  });

  it("ends with today and starts before anything could have been earned", () => {
    const period = resolvePointsPeriod("all", NOW);

    expect(period.startDate).toBe(POINTS_EPOCH_DATE);
    expect(period.endDate).toBe("2026-09-09");
    expect(period.startsAt.getTime()).toBeLessThan(
      new Date("2000-01-01T00:00:00.000Z").getTime(),
    );
  });

  it("admits an award from any date before its end", () => {
    const { startsAt, endsAt } = resolvePointsPeriod("all", NOW);
    // The repository's window is `createdAt >= startsAt && < endsAt`, so these
    // are the two questions that decide whether a point is counted.
    for (const award of [
      new Date("2024-03-01T00:00:00.000Z"),
      new Date("2026-08-31T15:00:00.000Z"),
      new Date("2026-09-09T02:59:00.000Z"),
    ]) {
      expect(award >= startsAt && award < endsAt).toBe(true);
    }
  });

  it("closes at the academy's midnight, not the reader's", () => {
    // 23:30 Seoul on the 9th is 14:30 UTC, which is still "today" in Seoul and
    // would be tomorrow nowhere the class meets. An evening class must not be
    // split across two dates.
    const period = resolvePointsPeriod("all", NOW);
    expect(new Date("2026-09-09T14:30:00.000Z") < period.endsAt).toBe(true);
    expect(new Date("2026-09-09T15:30:00.000Z") < period.endsAt).toBe(false);
  });

  it("keeps the same end for the same instant read from two zones", () => {
    const seoul = resolvePointsPeriod("all", NOW, "Asia/Seoul");
    const utc = resolvePointsPeriod("all", NOW, "UTC");
    // The label differs — it is the academy's own date — but neither can admit
    // an award that has not happened yet.
    expect(seoul.endsAt.getTime()).not.toBe(utc.endsAt.getTime());
    expect(seoul.startDate).toBe(utc.startDate);
  });

  it("has no period before it, and says so rather than inventing one", () => {
    const period = resolvePointsPeriod("all", NOW);
    expect(() => previousPointsPeriod(period)).toThrow(/no previous period/i);
  });

  it("is what an unknown value falls back to", () => {
    expect(parsePointsPeriodKind("season")).toBe("all");
    expect(parsePointsPeriodKind(undefined)).toBe("all");
    // And an explicit one is still honoured, so an existing bookmark carrying
    // `?period=day` keeps meaning today.
    expect(parsePointsPeriodKind("day")).toBe("day");
  });
});

describe("the calendar periods beside it", () => {
  it("still resolve as they did", () => {
    expect(resolvePointsPeriod("day", NOW).startDate).toBe("2026-09-09");
    // Wednesday the 9th, so the week opened on Monday the 7th.
    expect(resolvePointsPeriod("week", NOW).startDate).toBe("2026-09-07");
    expect(resolvePointsPeriod("month", NOW).startDate).toBe("2026-09-01");
    expect(resolvePointsPeriod("month", NOW).endDate).toBe("2026-09-30");
  });

  it("still have a period before them", () => {
    expect(previousPointsPeriod(resolvePointsPeriod("day", NOW)).startDate)
      .toBe("2026-09-08");
    expect(previousPointsPeriod(resolvePointsPeriod("week", NOW)).startDate)
      .toBe("2026-08-31");
    expect(previousPointsPeriod(resolvePointsPeriod("month", NOW)).startDate)
      .toBe("2026-08-01");
  });
});
