import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { AcademiesModule } from "../academies/academies.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import type { ApiEnvironment } from "../config/env.schema.js";
import { LearnModule } from "../learn/learn.module.js";
import { AiHelpService } from "./ai-help.service.js";
import { AiMaintenanceService } from "./ai-maintenance.service.js";
import { AiModelClient, OpenAiModelClient } from "./ai-model.js";
import { AiUsageService } from "./ai-usage.service.js";
import { AiLibraryJobService } from "./library/library-job.service.js";
import { AiLibraryService } from "./library/library.service.js";

/**
 * The Cove AI learning assistant
 * (docs/superpowers/specs/2026-11-25-cove-ai-learning-assistant-design.md).
 *
 * The one place that holds the model key. `LearnModule` provides the judge
 * queue, which is null without Redis: help still works, libraries wait.
 */
@Module({
  imports: [AcademiesModule, AuthorizationModule, LearnModule],
  providers: [
    AiHelpService,
    AiLibraryJobService,
    AiLibraryService,
    AiMaintenanceService,
    AiUsageService,
    {
      provide: AiModelClient,
      inject: [ConfigService],
      useFactory: (config: ConfigService<ApiEnvironment, true>) => new OpenAiModelClient(config.get("OPENAI_API_KEY", { infer: true })),
    },
  ],
  exports: [AiHelpService, AiLibraryService, AiUsageService],
})
export class AiAssistantModule {}
