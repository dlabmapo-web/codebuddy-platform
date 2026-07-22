import { PrismaPg } from "@prisma/adapter-pg";
import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { PrismaClient } from "../generated/prisma/client.js";
import type { ApiEnvironment } from "../config/env.schema.js";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(configService: ConfigService<ApiEnvironment, true>) {
    const connectionString = configService.get("DATABASE_URL", { infer: true });
    const adapter = new PrismaPg({ connectionString });

    super({ adapter });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  async checkConnection(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }
}
