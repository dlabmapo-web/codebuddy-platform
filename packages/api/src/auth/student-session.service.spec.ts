import { STUDENT_INACTIVITY_LIMIT_MS } from "@cove/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SupabaseIdentity } from "./auth.types.js";
import { StudentSessionService } from "./student-session.service.js";

const identity: SupabaseIdentity = {
  authUserId: "10000000-0000-4000-8000-000000000001",
  sessionId: "20000000-0000-4000-8000-000000000001",
  email: "student@cove.test",
  emailVerified: true,
  username: "student",
  displayName: "Student",
  avatarUrl: null,
  provider: "email",
  requestedAcademyId: null,
};

function createRedis() {
  const values = new Map<string, number>();
  return {
    values,
    get: vi.fn(async (key: string) =>
      values.has(key) ? String(values.get(key)) : null
    ),
    del: vi.fn(async (key: string) => Number(values.delete(key))),
    set: vi.fn(async (key: string, value: string) => {
      if (values.has(key)) return null;
      values.set(key, Number(value));
      return "OK";
    }),
    eval: vi.fn(
      async (
        _script: string,
        _keys: number,
        key: string,
        now: string,
        next: string,
      ) => {
        const current = values.get(key);
        if (current === undefined || current <= Number(now)) {
          values.delete(key);
          return -1;
        }
        values.set(key, Number(next));
        return Number(next);
      },
    ),
  };
}

describe("StudentSessionService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T01:00:00.000Z"));
  });

  afterEach(() => vi.useRealTimers());

  it("begins one lease and returns the same deadline on a retry", async () => {
    const redis = createRedis();
    const service = new StudentSessionService(redis as never);
    const first = await service.begin(identity);
    vi.advanceTimersByTime(60_000);
    const retry = await service.begin(identity);

    expect(retry).toEqual(first);
    expect(Date.parse(first.deadline) - Date.parse("2026-08-14T01:00:00.000Z"))
      .toBe(STUDENT_INACTIVITY_LIMIT_MS);
  });

  it("extends activity at 29:59 from the server clock", async () => {
    const redis = createRedis();
    const service = new StudentSessionService(redis as never);
    await service.begin(identity);
    vi.advanceTimersByTime(STUDENT_INACTIVITY_LIMIT_MS - 1_000);

    const extended = await service.extend(identity);
    expect(Date.parse(extended.deadline) - Date.now())
      .toBe(STUDENT_INACTIVITY_LIMIT_MS);
  });

  it("cannot revive an elapsed or missing lease", async () => {
    const redis = createRedis();
    const service = new StudentSessionService(redis as never);
    await service.begin(identity);
    vi.advanceTimersByTime(STUDENT_INACTIVITY_LIMIT_MS);

    await expect(service.extend(identity)).rejects.toMatchObject({
      code: "STUDENT_SESSION_EXPIRED",
    });
    await expect(service.current(identity)).rejects.toMatchObject({
      code: "STUDENT_SESSION_EXPIRED",
    });
  });

  it("fails closed when Redis or the session claim is unavailable", async () => {
    await expect(
      new StudentSessionService(null).current(identity),
    ).rejects.toMatchObject({ code: "STUDENT_SESSION_UNAVAILABLE" });

    const redis = createRedis();
    await expect(
      new StudentSessionService(redis as never).current({
        ...identity,
        sessionId: null,
      }),
    ).rejects.toMatchObject({ code: "TOKEN_INVALID" });
  });
});
