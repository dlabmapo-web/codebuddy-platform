import { Module } from "@nestjs/common";

import { SupabaseAuthService } from "./supabase-auth.service.js";

/**
 * The Supabase service-role client, on its own.
 *
 * Extracted from `AuthModule` because two module trees need it and one of them
 * is underneath the other: `AuthModule` imports `AcademiesModule`, and the
 * student credential service in `AcademiesModule` sets passwords through this.
 * Leaving the provider in `AuthModule` would have made that a cycle. Nothing
 * about the client is auth-flow specific — it is a configured connection — so
 * a module of its own is where it belonged anyway.
 */
@Module({
  providers: [SupabaseAuthService],
  exports: [SupabaseAuthService],
})
export class SupabaseAuthModule {}
