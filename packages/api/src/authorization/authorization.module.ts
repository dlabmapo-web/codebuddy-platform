import { Module } from "@nestjs/common";

import { AcademyAccessService } from "./academy-access.service.js";

@Module({
  providers: [AcademyAccessService],
  exports: [AcademyAccessService],
})
export class AuthorizationModule {}
