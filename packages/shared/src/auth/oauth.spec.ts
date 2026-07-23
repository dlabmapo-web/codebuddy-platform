import { describe, expect, it } from "vitest";

import { socialAuthProviderSchema } from "./oauth.js";

describe("socialAuthProviderSchema", () => {
  it.each(["google", "kakao", "custom:naver"] as const)(
    "accepts configured provider %s",
    (provider) => {
      expect(socialAuthProviderSchema.parse(provider)).toBe(provider);
    },
  );

  it("rejects arbitrary provider identifiers", () => {
    expect(socialAuthProviderSchema.safeParse("github").success).toBe(false);
  });
});
