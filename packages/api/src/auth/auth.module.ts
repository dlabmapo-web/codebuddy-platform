import { Module } from "@nestjs/common";

import { AcademiesModule } from "../academies/academies.module.js";
import { AuthService } from "./auth.service.js";
import { OAuthOnboardingIntentService } from "./oauth-onboarding-intent.service.js";
import { SupabaseAuthService } from "./supabase-auth.service.js";

@Module({
  imports: [AcademiesModule],
  providers: [
    AuthService,
    OAuthOnboardingIntentService,
    SupabaseAuthService,
  ],
  exports: [
    AuthService,
    OAuthOnboardingIntentService,
    SupabaseAuthService,
  ],
})
export class AuthModule {}
