import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import {
  STUDENT_INACTIVITY_LIMIT_MS,
  type StudentSessionDeadline,
} from "@cove/shared";

import { AppException } from "../common/app-exception.js";
import {
  MONITORING_REDIS,
  type MonitoringRedis,
} from "../monitoring/monitoring.tokens.js";
import type { SupabaseIdentity } from "./auth.types.js";

const keyPrefix = "cove:student-session:";

const extendScript = `
local current = redis.call('GET', KEYS[1])
if not current then return -1 end
if tonumber(current) <= tonumber(ARGV[1]) then
  redis.call('DEL', KEYS[1])
  return -1
end
redis.call('SET', KEYS[1], ARGV[2], 'PX', ARGV[3])
return tonumber(ARGV[2])
`;

/** Server authority for the thirty-minute student inactivity policy. */
@Injectable()
export class StudentSessionService {
  constructor(
    @Inject(MONITORING_REDIS) private readonly redis: MonitoringRedis,
  ) {}

  async begin(identity: SupabaseIdentity): Promise<StudentSessionDeadline> {
    const redis = this.requireRedis();
    const key = this.key(identity);
    const now = Date.now();
    const deadline = now + STUDENT_INACTIVITY_LIMIT_MS;
    const created = await redis.set(
      key,
      String(deadline),
      "PX",
      STUDENT_INACTIVITY_LIMIT_MS,
      "NX",
    );
    if (created === "OK") return response(deadline);

    // Authentication completion can be retried after its response was lost.
    // That retry observes the same lease; it does not lengthen it.
    return response(await this.readDeadline(identity, now));
  }

  async current(identity: SupabaseIdentity): Promise<StudentSessionDeadline> {
    return response(await this.readDeadline(identity, Date.now()));
  }

  async extend(identity: SupabaseIdentity): Promise<StudentSessionDeadline> {
    const redis = this.requireRedis();
    const now = Date.now();
    const deadline = now + STUDENT_INACTIVITY_LIMIT_MS;
    const result = Number(
      await redis.eval(
        extendScript,
        1,
        this.key(identity),
        String(now),
        String(deadline),
        String(STUDENT_INACTIVITY_LIMIT_MS),
      ),
    );
    if (!Number.isFinite(result) || result < 0) this.expired();
    return response(result);
  }

  async requireActive(identity: SupabaseIdentity): Promise<void> {
    await this.readDeadline(identity, Date.now());
  }

  private async readDeadline(
    identity: SupabaseIdentity,
    now: number,
  ): Promise<number> {
    const redis = this.requireRedis();
    const key = this.key(identity);
    const deadline = Number(await redis.get(key));
    if (!Number.isFinite(deadline) || deadline <= now) {
      if (Number.isFinite(deadline)) await redis.del(key);
      this.expired();
    }
    return deadline;
  }

  private key(identity: SupabaseIdentity): string {
    if (!identity.sessionId) {
      throw new AppException("TOKEN_INVALID", HttpStatus.UNAUTHORIZED);
    }
    return `${keyPrefix}${identity.sessionId}`;
  }

  private requireRedis() {
    if (!this.redis) {
      throw new AppException(
        "STUDENT_SESSION_UNAVAILABLE",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return this.redis;
  }

  private expired(): never {
    throw new AppException("STUDENT_SESSION_EXPIRED", HttpStatus.UNAUTHORIZED);
  }
}

function response(deadline: number): StudentSessionDeadline {
  return { deadline: new Date(deadline).toISOString() };
}
