import { describe, expect, it } from "vitest";

import {
  buildPlaceholderEmail,
  displayableEmail,
  isPlaceholderAddress,
} from "./placeholder-email.js";
import {
  generateIssuedPassword,
  issuedPasswordAlphabet,
  issuedPasswordLength,
  issuedPasswordPrefix,
  maskIssuedPassword,
} from "./student-password.js";

describe("placeholder addresses", () => {
  it("recognizes an address it built", () => {
    const email = buildPlaceholderEmail("11111111-2222-4333-8444-555555555555");
    expect(isPlaceholderAddress(email)).toBe(true);
    expect(displayableEmail(email)).toBeNull();
  });

  it("does not confuse the sign-in resolver's domain for its own", () => {
    // Sharing one domain would make "this account has no email" and "this
    // account does not exist" the same string.
    expect(isPlaceholderAddress("teacher@unresolved.invalid")).toBe(false);
  });

  it("matches the domain exactly, not as a suffix", () => {
    expect(isPlaceholderAddress("a@evil-no-email.cove.invalid")).toBe(false);
    expect(isPlaceholderAddress("a@no-email.cove.invalid.example")).toBe(false);
  });

  it("passes a real address through untouched", () => {
    expect(isPlaceholderAddress("teacher@dlab.example")).toBe(false);
    expect(displayableEmail("teacher@dlab.example")).toBe(
      "teacher@dlab.example",
    );
    expect(displayableEmail(null)).toBeNull();
  });
});

describe("issued student passwords", () => {
  it("uses only characters a child can read back", () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const password = generateIssuedPassword();
      expect(password).toHaveLength(issuedPasswordLength);
      for (const character of password) {
        expect(issuedPasswordAlphabet).toContain(character);
      }
      expect(password).not.toMatch(/[ilo01]/);
    }
  });

  it("does not repeat itself", () => {
    const seen = new Set(
      Array.from({ length: 100 }, () => generateIssuedPassword()),
    );
    expect(seen.size).toBe(100);
  });

  it("masks everything past the visible prefix", () => {
    const password = "hae472kvpn";
    const prefix = issuedPasswordPrefix(password);
    expect(prefix).toBe("hae");
    expect(maskIssuedPassword(prefix, password.length)).toBe("hae•••••••");
  });
});
