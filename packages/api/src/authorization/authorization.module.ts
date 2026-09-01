import { Module } from "@nestjs/common";

import { AcademyAccessService } from "./academy-access.service.js";
import { SupportGrantResolver } from "./support-grant.resolver.js";
import { PlatformAccessService } from "./platform-access.service.js";

@Module({
  providers: [AcademyAccessService, SupportGrantResolver, PlatformAccessService],
  exports: [AcademyAccessService, SupportGrantResolver, PlatformAccessService],
})
export class AuthorizationModule {}
