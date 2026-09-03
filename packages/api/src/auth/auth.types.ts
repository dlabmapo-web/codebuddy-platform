export type SupabaseIdentity = {
  authUserId: string;
  /** Stable across access-token refreshes, new for every Supabase login. */
  sessionId?: string | null;
  email: string | null;
  /**
   * Whether `email` is a generated address for an account that has none — a
   * student. Derived at the token boundary from the reserved domain, so the
   * flag can never drift from the address it describes.
   */
  emailIsPlaceholder: boolean;
  emailVerified: boolean;
  /** The name chosen at signup, claimed once by `bootstrap`. */
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  provider: string | null;
  requestedAcademyId: string | null;
};
