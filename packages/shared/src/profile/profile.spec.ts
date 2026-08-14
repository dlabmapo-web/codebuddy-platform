import { describe, expect, it } from "vitest";

import { sniffImageType } from "./image.js";
import { initialsOf, resolveAvatar, resolveDisplayName } from "./profile.js";
import { optionalBirthDate, optionalPhone, safeText } from "./text.js";

describe("resolveAvatar", () => {
  // Design §10.4. The order matters more than any single case: removing an
  // academy override must reveal the global image rather than blank the row.
  it("prefers the academy image, then global, then the external photo", () => {
    expect(
      resolveAvatar({
        academyImageUrl: "academy",
        globalImageUrl: "global",
        externalAvatarUrl: "oauth",
      }),
    ).toEqual({ kind: "academy", url: "academy" });

    expect(
      resolveAvatar({ globalImageUrl: "global", externalAvatarUrl: "oauth" }),
    ).toEqual({ kind: "global", url: "global" });

    expect(resolveAvatar({ externalAvatarUrl: "oauth" })).toEqual({
      kind: "external",
      url: "oauth",
    });
  });

  it("falls back to initials rather than an empty frame", () => {
    expect(resolveAvatar({ name: "Jurabek Samiev" })).toEqual({
      kind: "initials",
      initials: "JS",
    });
  });
});

describe("initialsOf", () => {
  it("takes one syllable for a Korean name and two letters for a Latin one", () => {
    expect(initialsOf("김민준")).toBe("김");
    expect(initialsOf("ada")).toBe("AD");
    expect(initialsOf("Ada Lovelace")).toBe("AL");
  });

  it("never returns an empty label", () => {
    expect(initialsOf(null)).toBe("?");
    expect(initialsOf("  ")).toBe("?");
  });
});

describe("resolveDisplayName", () => {
  it("uses the academy override before the global name", () => {
    expect(
      resolveDisplayName({
        academyDisplayName: "민준",
        displayName: "Minjun Kim",
        fallback: "Member",
      }),
    ).toBe("민준");
  });

  it("degrades to the sign-in handle before the fallback", () => {
    expect(
      resolveDisplayName({ username: "minjun", fallback: "Member" }),
    ).toBe("minjun");
    expect(
      resolveDisplayName({ email: "minjun@example.com", fallback: "Member" }),
    ).toBe("minjun");
    expect(resolveDisplayName({ fallback: "Member" })).toBe("Member");
  });
});

describe("field schemas", () => {
  it("trims text and refuses control characters", () => {
    expect(safeText(10).parse("  hi  ")).toBe("hi");
    expect(safeText(10).safeParse("a\0b").success).toBe(false);
    expect(safeText(10).safeParse("a‮b").success).toBe(false);
  });

  it("collapses a cleared input to null", () => {
    expect(optionalPhone.parse("")).toBeNull();
    expect(optionalPhone.parse(null)).toBeNull();
  });

  it("rejects a phone whose country cannot be established", () => {
    expect(optionalPhone.safeParse("5551234567").success).toBe(false);
    expect(optionalPhone.parse("010-1234-5678")).toBe("+821012345678");
  });

  it("rejects a future or implausible birth date", () => {
    expect(optionalBirthDate.safeParse("2999-01-01").success).toBe(false);
    expect(optionalBirthDate.safeParse("1899-12-31").success).toBe(false);
    expect(optionalBirthDate.parse("2012-05-04")).toBe("2012-05-04");
    expect(optionalBirthDate.parse(null)).toBeNull();
  });
});

describe("sniffImageType", () => {
  // The declared content type is attacker-supplied; the bytes are not.
  it("reads the format from the bytes, not the caller's claim", () => {
    const jpeg = new Uint8Array(16);
    jpeg.set([0xff, 0xd8, 0xff, 0xe0]);
    expect(sniffImageType(jpeg)).toBe("image/jpeg");

    const png = new Uint8Array(16);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(sniffImageType(png)).toBe("image/png");

    const webp = new Uint8Array(16);
    webp.set([0x52, 0x49, 0x46, 0x46]);
    webp.set([0x57, 0x45, 0x42, 0x50], 8);
    expect(sniffImageType(webp)).toBe("image/webp");
  });

  it("refuses SVG and anything else it cannot name", () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">');
    expect(sniffImageType(svg)).toBeNull();
    expect(sniffImageType(new Uint8Array(4))).toBeNull();
  });
});
