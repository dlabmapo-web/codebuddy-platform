import { describe, expect, it } from "vitest";

import { validateEnvironment } from "./env.schema.js";

const validEnvironment = {
  NODE_ENV: "test",
  PORT: "4100",
  WEB_ORIGIN: "http://localhost:3000",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SECRET_KEY: "sb_secret_test_value",
  DATABASE_URL: "postgresql://user:password@localhost:5432/cove",
  DIRECT_URL: "postgresql://user:password@localhost:5432/cove",
};

describe("validateEnvironment", () => {
  it("parses and types a valid API environment", () => {
    expect(validateEnvironment(validEnvironment)).toMatchObject({
      NODE_ENV: "test",
      PORT: 4100,
      WEB_ORIGIN: "http://localhost:3000",
    });
  });

  it("reports invalid variable names without exposing values", () => {
    const secretValue = "do-not-print-this-secret";

    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        SUPABASE_SECRET_KEY: "",
        DATABASE_URL: secretValue,
      }),
    ).toThrowError(/SUPABASE_SECRET_KEY.*DATABASE_URL/);

    try {
      validateEnvironment({
        ...validEnvironment,
        SUPABASE_SECRET_KEY: "",
        DATABASE_URL: secretValue,
      });
    } catch (error) {
      expect(String(error)).not.toContain(secretValue);
    }
  });

  it("requires the BFF shared secret in production", () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: "production",
      }),
    ).toThrowError(/BFF_SHARED_SECRET/);

    expect(validateEnvironment({
      ...validEnvironment,
      NODE_ENV: "production",
      BFF_SHARED_SECRET: "a-production-secret-with-at-least-32-bytes",
      TURNSTILE_SECRET_KEY: "0x-turnstile-secret",
      EMAIL_API_KEY: "re_test",
      EMAIL_FROM: "Cove <hello@example.com>",
      EMAIL_WEBHOOK_SECRET: "whsec_test-secret-value",
    })).toMatchObject({ NODE_ENV: "production" });
  });

  it("requires provider email configuration in production", () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: "production",
        BFF_SHARED_SECRET: "a-production-secret-with-at-least-32-bytes",
      }),
    ).toThrowError(/EMAIL_API_KEY.*EMAIL_FROM.*EMAIL_WEBHOOK_SECRET/);
  });
});
