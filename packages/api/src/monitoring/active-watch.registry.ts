import { Inject, Injectable } from "@nestjs/common";

import {
  MONITORING_REDIS,
  monitoringKeyPrefix,
  type MonitoringRedis,
} from "./monitoring.tokens.js";

const watchTtlMs = 12 * 60 * 60 * 1_000;

@Injectable()
export class ActiveWatchRegistry {
  constructor(@Inject(MONITORING_REDIS) private readonly redis: MonitoringRedis) {}

  async replace(teacherMembershipId: string, visitId: string): Promise<string | null> {
    if (!this.redis) throw new Error("monitoring Redis unavailable");
    const key = this.key(teacherMembershipId);
    const previous = await this.redis.eval(
      "local old=redis.call('GET',KEYS[1]); redis.call('SET',KEYS[1],ARGV[1],'PX',ARGV[2]); return old",
      1,
      key,
      visitId,
      watchTtlMs.toString(),
    );
    return typeof previous === "string" ? previous : null;
  }

  async isActive(teacherMembershipId: string, visitId: string): Promise<boolean> {
    if (!this.redis) return false;
    return (await this.redis.get(this.key(teacherMembershipId))) === visitId;
  }

  async clear(teacherMembershipId: string, visitId: string): Promise<void> {
    if (!this.redis) return;
    await this.redis.eval(
      "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0",
      1,
      this.key(teacherMembershipId),
      visitId,
    );
  }

  private key(teacherMembershipId: string): string {
    return `${monitoringKeyPrefix}active-watch:${teacherMembershipId}`;
  }
}
