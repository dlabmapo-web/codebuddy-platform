import { Module } from "@nestjs/common";
import { AcademiesModule } from "../academies/academies.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { MonitoringRevocationModule } from "../monitoring/monitoring-revocation.module.js";
import { LearnModule } from "../learn/learn.module.js";
import { ManualAssetsService } from "../manual/manual-assets.service.js";
import { ExplanationController } from "./explanation.controller.js";
import { ExplanationService } from "./explanation.service.js";
@Module({ imports: [AcademiesModule, AuthModule, AuthorizationModule, LearnModule, MonitoringRevocationModule], controllers: [ExplanationController], providers: [ExplanationService, ManualAssetsService] })
export class ExplanationsModule {}
