import { Module } from "@nestjs/common";

import { AuthService } from "./auth.service.js";
import { SupabaseAuthService } from "./supabase-auth.service.js";

@Module({
  providers: [AuthService, SupabaseAuthService],
  exports: [AuthService, SupabaseAuthService],
})
export class AuthModule {}
