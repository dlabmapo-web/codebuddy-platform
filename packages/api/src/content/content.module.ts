import { Module } from "@nestjs/common";

import { AcademiesModule } from "../academies/academies.module.js";
import { AuthorizationModule } from "../authorization/authorization.module.js";
import { CourseService } from "./course.service.js";

@Module({
  imports: [AcademiesModule, AuthorizationModule],
  providers: [CourseService],
  exports: [CourseService],
})
export class ContentModule {}
