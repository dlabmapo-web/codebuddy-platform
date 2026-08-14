import { Module } from "@nestjs/common";

import { AcademiesModule } from "../academies/academies.module.js";
import { MediaModule } from "../profile/media.module.js";
import { AuthService } from "./auth.service.js";
import { OAuthOnboardingIntentService } from "./oauth-onboarding-intent.service.js";
import { SupabaseAuthService } from "./supabase-auth.service.js";
import { MonitoringRevocationModule } from "../monitoring/monitoring-revocation.module.js";
import { StudentSessionService } from "./student-session.service.js";

@Module({
  imports: [AcademiesModule, MediaModule, MonitoringRevocationModule],
  providers: [
    AuthService,
    OAuthOnboardingIntentService,
    SupabaseAuthService,
    StudentSessionService,
  ],
  exports: [
    AuthService,
    OAuthOnboardingIntentService,
    SupabaseAuthService,
    StudentSessionService,
  ],
})
export class AuthModule {}
