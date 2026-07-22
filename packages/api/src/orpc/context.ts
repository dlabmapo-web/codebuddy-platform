import type { implement } from "@orpc/server";
import type { Request } from "express";
import type { appContract } from "@cove/shared";

import type { AuthService } from "../auth/auth.service.js";
import type { SupabaseAuthService } from "../auth/supabase-auth.service.js";

export type ORPCContext = { req: Request };
export type ORPCImplementer = ReturnType<
  typeof implement<typeof appContract, ORPCContext>
>;

export type ORPCDeps = {
  authService: AuthService;
  supabaseAuthService: SupabaseAuthService;
};

export function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}
