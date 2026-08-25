import { describe, expect, it } from "vitest";

import { parseArguments } from "./cli.js";

describe("MVP curriculum migration CLI arguments", () => {
  it("accepts the separator forwarded by pnpm", () => {
    expect(parseArguments(["--", "--mode=inspect"])).toMatchObject({
      mode: "inspect",
    });
  });

  it("also accepts direct execution without a separator", () => {
    expect(parseArguments(["--mode=dry-run"])).toMatchObject({
      mode: "dry-run",
    });
  });

  it("continues to reject unknown arguments", () => {
    expect(() => parseArguments(["--", "--mode=inspect", "--unsafe"])).toThrow(
      "Unknown flag: --unsafe",
    );
  });

  it("rejects repeated separators", () => {
    expect(() => parseArguments(["--", "--", "--mode=inspect"])).toThrow(
      "The command-line separator may appear only once.",
    );
  });
});
