export type SupabaseIdentity = {
  authUserId: string;
  /** Stable across access-token refreshes, new for every Supabase login. */
  sessionId?: string | null;
  email: string | null;
  emailVerified: boolean;
  /** The name chosen at signup, claimed once by `bootstrap`. */
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  provider: string | null;
  requestedAcademyId: string | null;
};
