import { Logger, type INestApplication } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-streams-adapter";
import type { Redis } from "ioredis";
import type { ServerOptions } from "socket.io";

import { monitoringKeyPrefix } from "./monitoring.tokens.js";

/**
 * Cross-instance delivery for the monitoring namespace.
 *
 * Redis Streams rather than Pub/Sub: a stream survives a brief Redis
 * interruption and lets a reconnecting client be given the packets it missed,
 * where Pub/Sub simply drops whatever was in flight. The stream is trimmed, so
 * an idle classroom cannot grow it without bound.
 *
 * Without Redis the adapter is not installed and the presence registry reports
 * itself unavailable — the API still serves every ordinary read, and the UI
 * shows degraded realtime instead of a class where nobody is online.
 */
export class MonitoringSocketAdapter extends IoAdapter {
  private readonly logger = new Logger(MonitoringSocketAdapter.name);
  private readonly streamRedis: Redis | null;

  constructor(
    app: INestApplication,
    redis: Redis | null,
    private readonly options: {
      origin: string;
      streamMaxLength: number;
      recoveryWindowMs: number;
    },
  ) {
    super(app);
    // The Streams adapter performs blocking reads. It must never share the
    // command connection used by presence, active-watch checks, or publishing.
    this.streamRedis = redis?.duplicate({ enableOfflineQueue: true }) ?? null;
  }

  createIOServer(port: number, options?: ServerOptions): unknown {
    const server = super.createIOServer(port, {
      ...options,
      // The browser sends a Supabase access token in the handshake, so the
      // origin is pinned to the web app rather than left open.
      cors: { origin: this.options.origin, credentials: true },
      connectionStateRecovery: {
        maxDisconnectionDuration: this.options.recoveryWindowMs,
        skipMiddlewares: false,
      },
    }) as {
      adapter: (adapter: unknown) => void;
    };

    if (!this.streamRedis) {
      this.logger.warn(
        "monitoring realtime running without Redis: cross-instance delivery is off",
      );
      return server;
    }

    server.adapter(
      createAdapter(this.streamRedis, {
        streamName: `${monitoringKeyPrefix}stream`,
        maxLen: this.options.streamMaxLength,
        sessionKeyPrefix: `${monitoringKeyPrefix}session:`,
      }),
    );
    return server;
  }
}
