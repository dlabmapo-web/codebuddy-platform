import {
  Controller,
  Get,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  databaseReadinessResponseSchema,
  healthResponseSchema,
  type DatabaseReadinessResponse,
  type HealthResponse,
} from "@cove/shared";

import { PrismaService } from "./database/prisma.service.js";

@Controller("health")
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  getHealth(): HealthResponse {
    return healthResponseSchema.parse({
      status: "ok",
      service: "cove-api",
    });
  }

  @Get("ready")
  async getReadiness(): Promise<DatabaseReadinessResponse> {
    try {
      await this.prisma.checkConnection();

      return databaseReadinessResponseSchema.parse({
        status: "ok",
        service: "cove-api",
        database: "reachable",
      });
    } catch {
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: "DATABASE_UNAVAILABLE",
        message: "Database is not ready",
      });
    }
  }
}
