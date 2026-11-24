import { Injectable } from "@nestjs/common";
import {
  ACADEMY_TIME_ZONE,
  TURTLE_ACTIVE_WINDOW_MS,
  academyDayEnd,
  academyDayStart,
  addLocalDays,
  type TurtleUsageInput,
  type TurtleUsageResult,
} from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { PlatformAccessService } from "../authorization/platform-access.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { Prisma } from "../generated/prisma/client.js";

type AcademyRow = {
  id: string; name: string; slug: string;
  active_now: number; devices: number; entries: number; runs: number;
  last_used_at: Date | null;
};
type BucketRow = { bucket: Date; devices: number; entries: number; runs: number };

/** Public Turtle use across academies. Two statements, however many academies there are. */
@Injectable()
export class PlatformTurtleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PlatformAccessService,
  ) {}

  async usage(identity: SupabaseIdentity, input: TurtleUsageInput, now = new Date()): Promise<TurtleUsageResult> {
    await this.access.requirePermission(identity.authUserId, "platform.analytics.read");
    const start = academyDayStart(input.from);
    const end = academyDayEnd(input.to);
    const activeSince = new Date(now.getTime() - TURTLE_ACTIVE_WINDOW_MS);
    const unit = input.from === input.to ? "hour" : "day";
    const only = input.academyId ? Prisma.sql`AND academy_id = ${input.academyId}::uuid` : Prisma.empty;

    const [academies, buckets] = await Promise.all([
      this.prisma.$queryRaw<AcademyRow[]>(Prisma.sql`
        WITH used AS (
          SELECT academy_id, COUNT(DISTINCT device_hash)::int AS devices,
                 SUM(entries)::int AS entries, SUM(runs)::int AS runs
          FROM turtle_usage_hours
          WHERE hour >= ${start}::timestamptz AND hour < ${end}::timestamptz
          GROUP BY academy_id
        ), active AS (
          SELECT academy_id, COUNT(DISTINCT device_hash)::int AS devices
          FROM turtle_usage_hours
          WHERE hour >= date_trunc('hour', ${activeSince}::timestamptz)
            AND last_seen_at >= ${activeSince}::timestamptz
          GROUP BY academy_id
        )
        SELECT a.id, a.name, a.slug,
               COALESCE(active.devices, 0) AS active_now,
               COALESCE(used.devices, 0) AS devices,
               COALESCE(used.entries, 0) AS entries,
               COALESCE(used.runs, 0) AS runs,
               (SELECT MAX(h.last_seen_at) FROM turtle_usage_hours h
                WHERE h.academy_id = a.id AND h.hour =
                  (SELECT MAX(l.hour) FROM turtle_usage_hours l WHERE l.academy_id = a.id)) AS last_used_at
        FROM academies a
        LEFT JOIN used ON used.academy_id = a.id
        LEFT JOIN active ON active.academy_id = a.id
        WHERE a.kind = 'ACADEMY' AND (a.status = 'ACTIVE' OR used.academy_id IS NOT NULL)
        ORDER BY runs DESC, devices DESC, a.name`),
      this.prisma.$queryRaw<BucketRow[]>(Prisma.sql`
        SELECT date_trunc(${unit}, hour, ${ACADEMY_TIME_ZONE}) AS bucket,
               COUNT(DISTINCT (academy_id, device_hash))::int AS devices,
               SUM(entries)::int AS entries, SUM(runs)::int AS runs
        FROM turtle_usage_hours
        WHERE hour >= ${start}::timestamptz AND hour < ${end}::timestamptz ${only}
        GROUP BY 1`),
    ]);

    const found = new Map(buckets.map((row) => [row.bucket.getTime(), row]));
    return {
      asOf: now.toISOString(),
      unit,
      academies: academies.map((row) => ({
        academyId: row.id, name: row.name, slug: row.slug, activeNow: row.active_now,
        devices: row.devices, entries: row.entries, runs: row.runs,
        lastUsedAt: row.last_used_at?.toISOString() ?? null,
      })),
      series: bucketStarts(input, unit).map((at) => {
        const row = found.get(at.getTime());
        return { at: at.toISOString(), devices: row?.devices ?? 0, entries: row?.entries ?? 0, runs: row?.runs ?? 0 };
      }),
    };
  }
}

function bucketStarts(input: TurtleUsageInput, unit: "hour" | "day"): Date[] {
  const starts: Date[] = [];
  if (unit === "hour") {
    const end = academyDayEnd(input.from).getTime();
    for (let at = academyDayStart(input.from).getTime(); at < end; at += 3_600_000) starts.push(new Date(at));
  } else {
    for (let day = input.from; day <= input.to; day = addLocalDays(day, 1)) starts.push(academyDayStart(day));
  }
  return starts;
}
