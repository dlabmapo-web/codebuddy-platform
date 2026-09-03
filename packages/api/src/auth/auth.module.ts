import { Module } from "@nestjs/common";

import { AcademiesModule } from "../academies/academies.module.js";
import { MediaModule } from "../profile/media.module.js";
import { AuthService } from "./auth.service.js";
import { OAuthOnboardingIntentService } from "./oauth-onboarding-intent.service.js";
import { PasswordRecoveryService } from "./password-recovery.service.js";
import { SupabaseAuthModule } from "./supabase-auth.module.js";
import { TurnstileService } from "./turnstile.service.js";
import { MonitoringRevocationModule } from "../monitoring/monitoring-revocation.module.js";
import { StudentSessionService } from "./student-session.service.js";

@Module({
  imports: [
    AcademiesModule,
    MediaModule,
    MonitoringRevocationModule,
    SupabaseAuthModule,
  ],
  providers: [
    AuthService,
    OAuthOnboardingIntentService,
    PasswordRecoveryService,
    TurnstileService,
    StudentSessionService,
  ],
  exports: [
    AuthService,
    OAuthOnboardingIntentService,
    PasswordRecoveryService,
    SupabaseAuthModule,
    TurnstileService,
    StudentSessionService,
  ],
})
export class AuthModule {}
