import { Module } from "@nestjs/common";

import { AcademiesModule } from "../academies/academies.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { AcademyProfileService } from "./academy-profile.service.js";
import { ProfileImageCleanupService } from "./profile-image-cleanup.service.js";
import { ProfileImageController } from "./profile-image.controller.js";
import { MediaModule } from "./media.module.js";
import { ProfileService } from "./profile.service.js";

@Module({
  // `AcademiesModule` for the audit writer, `AuthModule` for the Supabase
  // identity lookup behind the security section.
  imports: [AcademiesModule, AuthModule, MediaModule],
  controllers: [ProfileImageController],
  providers: [
    AcademyProfileService,
    ProfileImageCleanupService,
    ProfileService,
  ],
  exports: [AcademyProfileService, ProfileService],
})
export class ProfileModule {}
