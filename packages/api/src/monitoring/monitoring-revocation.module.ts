import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Redis } from "ioredis";

import { ActiveWatchRegistry } from "./active-watch.registry.js";
import { MonitoringMetricsService } from "./monitoring-metrics.service.js";
import { MonitoringRevocationService } from "./monitoring-revocation.service.js";
import { MonitoringVisitService } from "./monitoring-visit.service.js";
import { MONITORING_REDIS } from "./monitoring.tokens.js";

/**
 * Revocation, on its own, deliberately.
 *
 * The services that change a teacher assignment, a class, an enrollment, or a
 * membership have to publish an access change — but they must not thereby
 * depend on authentication, presence, or the gateway. Keeping the publisher in
 * a module that imports nothing is what lets `AcademiesModule` and
 * `ClassesModule` use it without a `forwardRef` cycle back through
 * `AuthModule`.
 */
@Module({
  providers: [
    {
      provide: MONITORING_REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url =
          config.get<string>("MONITORING_REDIS_URL") ??
          config.get<string>("REDIS_URL");
        return url
          ? new Redis(url, { maxRetriesPerRequest: 2, enableOfflineQueue: false })
          : null;
      },
    },
    ActiveWatchRegistry,
    MonitoringVisitService,
    MonitoringMetricsService,
    MonitoringRevocationService,
  ],
  exports: [
    MonitoringVisitService,
    MonitoringMetricsService,
    MonitoringRevocationService,
    ActiveWatchRegistry,
    MONITORING_REDIS,
  ],
})
export class MonitoringRevocationModule {}
