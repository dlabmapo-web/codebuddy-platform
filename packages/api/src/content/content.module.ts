import { Module } from "@nestjs/common";

import { AcademiesModule } from "../academies/academies.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { CourseService } from "./course.service.js";
import { MonitoringRevocationModule } from "../monitoring/monitoring-revocation.module.js";

@Module({
  imports: [AcademiesModule, AuthorizationModule, MonitoringRevocationModule],
  providers: [CourseService],
  exports: [CourseService],
})
export class ContentModule {}
