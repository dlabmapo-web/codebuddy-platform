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
  it("defaults native off and requires a pinned manifest path for activation", () => {
    expect(validateEnvironment(validEnvironment).GRADING_NATIVE_ENABLED).toBe(false);
    expect(validateEnvironment(validEnvironment).GRADING_RUNTIME_MANIFEST_PATH).toBeUndefined();
    expect(() => validateEnvironment({ ...validEnvironment, GRADING_NATIVE_ENABLED: "true" })).toThrow(/MANIFEST/);
    expect(() => validateEnvironment({ ...validEnvironment, GRADING_NATIVE_ENABLED: "yes" })).toThrow();
    expect(() => validateEnvironment({ ...validEnvironment, GRADING_RUNTIME_MANIFEST_PATH: "relative.json" })).toThrow();
    expect(validateEnvironment({ ...validEnvironment, GRADING_NATIVE_ENABLED: "false", GRADING_RUNTIME_MANIFEST_PATH: "/immutable/runtime.json" }).GRADING_NATIVE_ENABLED).toBe(false);
  });
  it('keeps public turtle disabled by default and requires an independent guest pool', () => {
    expect(validateEnvironment(validEnvironment).TURTLE_TRIAL_ENABLED).toBe(false);
    expect(() => validateEnvironment({ ...validEnvironment, TURTLE_TRIAL_ENABLED: 'true' })).toThrow(/TURTLE_TRIAL_PIN_PEPPER/);
    const trial = { ...validEnvironment, TURTLE_TRIAL_ENABLED: 'true',
      TURTLE_TRIAL_PIN_DIGEST: 'a'.repeat(64), TURTLE_TRIAL_PIN_PEPPER: 'p'.repeat(43),
      TURTLE_TRIAL_PIN_VERSION: 'v1', TURTLE_TRIAL_SERVICE_URL: 'http://guest:4010',
      TURTLE_TRIAL_SERVICE_SECRET: 'g'.repeat(43), TURTLE_TRIAL_PUBLIC_WS_URL: 'ws://localhost:4017',
      BFF_SHARED_SECRET: 'b'.repeat(43), REDIS_URL: 'redis://localhost:6379' };
    expect(validateEnvironment(trial).TURTLE_TRIAL_ENABLED).toBe(true);
    expect(validateEnvironment(trial).TURTLE_TRIAL_LEGACY_PIN_ENABLED).toBe(false);
    expect(validateEnvironment({ ...trial, TURTLE_TRIAL_PIN_DIGEST: undefined, TURTLE_TRIAL_PIN_VERSION: undefined }).TURTLE_TRIAL_ENABLED).toBe(true);
    expect(() => validateEnvironment({ ...trial, TURTLE_TRIAL_LEGACY_PIN_ENABLED: 'true', TURTLE_TRIAL_PIN_DIGEST: undefined })).toThrow(/TURTLE_TRIAL_PIN_DIGEST/);
    expect(() => validateEnvironment({ ...trial, GUI_SERVICE_URL: trial.TURTLE_TRIAL_SERVICE_URL })).toThrow(/separate guest broker/);
    expect(() => validateEnvironment({ ...trial, GUI_SERVICE_SECRET: trial.TURTLE_TRIAL_SERVICE_SECRET })).toThrow(/independent/);
  });
  it('keeps browser execution off, accepts blank Compose defaults and validates enabled origin isolation', () => {
    const defaults = validateEnvironment({ ...validEnvironment, TURTLE_TRIAL_BROWSER_RUNTIME_ORIGIN: '', TURTLE_TRIAL_BROWSER_RUNTIME_ID: '' });
    expect(defaults.TURTLE_TRIAL_BROWSER_ENABLED).toBe(false); expect(defaults.TURTLE_TRIAL_BROWSER_ADMISSION_ENABLED).toBe(false);
    const enabled = { ...validEnvironment, TURTLE_TRIAL_ENABLED: 'true', TURTLE_TRIAL_BROWSER_ENABLED: 'true', TURTLE_TRIAL_BROWSER_ADMISSION_ENABLED: 'true',
      TURTLE_TRIAL_BROWSER_RUNTIME_ORIGIN: 'https://runtime.example', TURTLE_TRIAL_BROWSER_RUNTIME_ID: 'brython-3.15.0-aaaaaaaaaaaaaaaaaaaa',
      TURTLE_TRIAL_PIN_PEPPER: 'p'.repeat(43), TURTLE_TRIAL_SERVICE_URL: 'http://guest:4010', TURTLE_TRIAL_SERVICE_SECRET: 'g'.repeat(43),
      TURTLE_TRIAL_PUBLIC_WS_URL: 'ws://localhost:4017', BFF_SHARED_SECRET: 'b'.repeat(43), REDIS_URL: 'redis://localhost:6379' };
    expect(validateEnvironment(enabled).TURTLE_TRIAL_BROWSER_ENABLED).toBe(true);
    expect(() => validateEnvironment({ ...enabled, TURTLE_TRIAL_BROWSER_RUNTIME_ORIGIN: 'https://localhost:4000' })).toThrow(/different hostname/);
    expect(() => validateEnvironment({ ...enabled, TURTLE_TRIAL_BROWSER_ENABLED: 'false' })).toThrow(/browser feature flags/);
    expect(() => validateEnvironment({ ...enabled, TURTLE_TRIAL_BROWSER_RUNTIME_ID: '' })).toThrow(/RUNTIME_ID/);
  });
  it("parses and types a valid API environment", () => {
    expect(validateEnvironment(validEnvironment)).toMatchObject({
      NODE_ENV: "test",
      PORT: 4100,
      WEB_ORIGIN: "http://localhost:3000",
    });
  });

  it("preserves and types the multiple-choice rollout flag from environment files", () => {
    expect(validateEnvironment(validEnvironment).MULTIPLE_CHOICE_ENABLED).toBe(false);
    expect(validateEnvironment({ ...validEnvironment, MULTIPLE_CHOICE_ENABLED: "true" }).MULTIPLE_CHOICE_ENABLED).toBe(true);
    expect(validateEnvironment({ ...validEnvironment, MULTIPLE_CHOICE_ENABLED: "false" }).MULTIPLE_CHOICE_ENABLED).toBe(false);
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
