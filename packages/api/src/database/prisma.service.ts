import { PrismaPg } from "@prisma/adapter-pg";
import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { PrismaClient } from "../generated/prisma/client.js";
import type { ApiEnvironment } from "../config/env.schema.js";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(configService: ConfigService<ApiEnvironment, true>) {
    const connectionString = configService.get("DATABASE_URL", { infer: true });
    // pg closes a connection idle for ten seconds by default, and reopening one
    // to the remote pooler costs a TLS handshake (~200 ms measured). Two minutes
    // keeps warm connections between clicks while staying well under the
    // pooler's network idle limit, so a kept connection is never silently cut.
    const adapter = new PrismaPg({ connectionString, idleTimeoutMillis: 120_000 });

    super({ adapter });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async checkConnection(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }
}
