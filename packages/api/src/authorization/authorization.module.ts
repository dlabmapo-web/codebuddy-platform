import { Module } from "@nestjs/common";

import { AcademyAccessService } from "./academy-access.service.js";
import { PlatformAccessService } from "./platform-access.service.js";

@Module({
  providers: [AcademyAccessService, PlatformAccessService],
  exports: [AcademyAccessService, PlatformAccessService],
})
export class AuthorizationModule {}
