import { describe, expect, it } from "vitest";

import { formatPhoneForDisplay, normalizePhone } from "./phone.js";

describe("normalizePhone", () => {
  it("keeps an international number and strips its formatting", () => {
    expect(normalizePhone(" +82 10-1234-5678 ")).toEqual({
      ok: true,
      value: "+821012345678",
    });
  });

  it("reads a Korean national number as the country it can establish", () => {
    expect(normalizePhone("010-1234-5678")).toEqual({
      ok: true,
      value: "+821012345678",
    });
    expect(normalizePhone("02 555 1234")).toEqual({
      ok: true,
      value: "+8225551234",
    });
  });

  // The whole point of the rule: a value with no country and no trunk zero
  // could be read three ways, and storing the wrong one means an emergency
  // contact that does not ring.
  it("refuses a number whose country it cannot establish", () => {
    expect(normalizePhone("5551234567").ok).toBe(false);
    expect(normalizePhone("821012345678").ok).toBe(false);
  });

  it("refuses lengths outside E.164", () => {
    expect(normalizePhone("+1234").ok).toBe(false);
    expect(normalizePhone("+1234567890123456").ok).toBe(false);
  });

  it("reports an empty value separately from an invalid one", () => {
    expect(normalizePhone("   ")).toEqual({ ok: false, reason: "EMPTY" });
  });
});

describe("formatPhoneForDisplay", () => {
  it("groups Korean mobile and Seoul numbers the way a reader expects", () => {
    expect(formatPhoneForDisplay("+821012345678")).toBe("010-1234-5678");
    expect(formatPhoneForDisplay("+8225551234")).toBe("02-555-1234");
  });

  it("leaves a number from elsewhere in the form Cove can verify", () => {
    expect(formatPhoneForDisplay("+14155550123")).toBe("+14155550123");
  });
});
