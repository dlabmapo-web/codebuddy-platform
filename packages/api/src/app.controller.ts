import { Controller, Get } from "@nestjs/common";
import {
  healthResponseSchema,
  type HealthResponse,
} from "@cove/shared";

@Controller("health")
export class AppController {
  @Get()
  getHealth(): HealthResponse {
    return healthResponseSchema.parse({
      status: "ok",
      service: "cove-api",
    });
  }
}
