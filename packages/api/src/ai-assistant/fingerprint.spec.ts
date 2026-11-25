import { describe, expect, it } from "vitest";

import { fingerprintOf, matchFingerprint } from "./fingerprint.js";

describe("fingerprintOf", () => {
  it("reads every test in order, whatever order they come in", () => {
    expect(fingerprintOf([
      { position: 3, outcome: "WRONG_OUTPUT" }, { position: 1, outcome: "PASSED" }, { position: 2, outcome: "PASSED_WITH_WARNING" },
      { position: 4, outcome: "RUNTIME_ERROR" }, { position: 5, outcome: "SKIPPED" },
    ])).toBe("PPFFS");
  });
});

describe("matchFingerprint", () => {
  it("is exact when every test agrees", () => {
    expect(matchFingerprint("PPPFFFFFFFFFFFF", "PPPFFFFFFFFFFFF")).toBe("exact");
  });
  it("is likely when most failed tests are shared", () => {
    expect(matchFingerprint("PPPFFFFFFFFFFFF", "PPPPFFFFFFFFFFF")).toBe("likely");
  });
  it("is no match for a different set of failures, different tests, or a pass", () => {
    expect(matchFingerprint("PPPFFFFFFFFFFFF", "FFFPPPPPPPPPPPP")).toBeNull();
    expect(matchFingerprint("PPPFFFFFFFFFFFF", "PPPFF")).toBeNull();
    expect(matchFingerprint("PPPP", "PPPP")).toBeNull();
    expect(matchFingerprint("PPFF", null)).toBeNull();
  });
});
