import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatShortDateTime,
  formatTime,
} from "./format.js";

describe("locale formatting", () => {
  const instant = "2026-07-24T06:40:00.000Z";

  it("formats dates in Korean academy time", () => {
    expect(formatDate(instant, "en")).toBe("Jul 24, 2026");
    expect(formatDate(instant, "ko")).toBe("2026년 7월 24일");
    expect(formatTime(instant, "en")).toBe("3:40 PM");
    expect(formatTime(instant, "ko")).toBe("오후 3:40");
    expect(formatDateTime(instant, "en")).toBe("Jul 24, 2026 · 3:40 PM");
    expect(formatDateTime(instant, "ko")).toBe("2026년 7월 24일 · 오후 3:40");
    expect(formatShortDateTime(instant, "en")).toBe("Jul 24 · 3:40 PM");
    expect(formatShortDateTime(instant, "ko")).toBe("7월 24일 · 오후 3:40");
  });

  it("formats numbers and percentages by locale", () => {
    expect(formatNumber(1204, "en")).toBe("1,204");
    expect(formatNumber(1204, "ko")).toBe("1,204");
    expect(formatPercent(0.24, "en")).toBe("24%");
    expect(formatPercent(0.24, "ko")).toBe("24%");
  });

  it("formats day periods consistently across ICU releases", () => {
    expect(formatTime("2026-07-23T15:00:00.000Z", "en")).toBe("12:00 AM");
    expect(formatTime("2026-07-23T15:00:00.000Z", "ko")).toBe("오전 12:00");
    expect(formatTime("2026-07-24T03:00:00.000Z", "en")).toBe("12:00 PM");
    expect(formatTime("2026-07-24T03:00:00.000Z", "ko")).toBe("오후 12:00");
  });
});
