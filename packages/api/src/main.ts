import { NestFactory } from "@nestjs/core";

import {
  runInRequestContext,
  setRequestViewRole,
} from "./common/request-context.js";
import { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";

import { monitoringTiming } from "@cove/shared";

import { AppModule } from "./app.module.js";
import type { ApiEnvironment } from "./config/env.schema.js";
import { MonitoringSocketAdapter } from "./monitoring/monitoring-socket.adapter.js";
import { MONITORING_REDIS } from "./monitoring/monitoring.tokens.js";
import { registerORPCRoutes } from "./orpc/router.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // The delivery webhook verifies the signature over the exact bytes the
    // provider signed.
    // Re-serializing a parsed body changes key order and whitespace, so the
    // signature would never match — the raw buffer has to survive parsing.
    rawBody: true,
  });
  const configService = app.get(ConfigService<ApiEnvironment, true>);

  // Before every route, so anything the request establishes about itself —
  // today, the support grant an academy act was authorized by — reaches the
  // audit writer without being threaded through every service between them.
  app.use(
    (
      request: { headers: Record<string, unknown> },
      _response: unknown,
      next: () => void,
    ) => {
      runInRequestContext(() => {
        // Which role a platform operator is viewing an academy as. Read here
        // rather than in the access service, which has no request to ask.
        // Validated there, not here: a header is caller-supplied text.
        const header = request.headers["x-cove-view-role"];
        const role = Array.isArray(header) ? header[0] : header;
        if (typeof role === "string" && role) setRequestViewRole(role);
        next();
      });
    },
  );

  app.setGlobalPrefix("api");
  app.enableCors({
    credentials: true,
    origin: configService.get("WEB_ORIGIN", { infer: true }),
  });
  app.enableShutdownHooks();
  registerORPCRoutes(app);

  // The monitoring namespace shares this HTTP server. Its adapter is installed
  // here rather than inside the gateway because cross-instance delivery is a
  // property of the process, not of one namespace.
  app.useWebSocketAdapter(
    new MonitoringSocketAdapter(app, app.get(MONITORING_REDIS, { strict: false }), {
      origin: configService.get("WEB_ORIGIN", { infer: true }),
      streamMaxLength: configService.get("MONITORING_STREAM_MAX_LENGTH", {
        infer: true,
      }),
      recoveryWindowMs: monitoringTiming.recoveryGraceMs,
    }),
  );

  await app.listen(configService.get("PORT", { infer: true }));
}

void bootstrap();
