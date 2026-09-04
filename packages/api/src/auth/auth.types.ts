import type { JoinRequestKind } from "@cove/shared";

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
  /**
   * Which shape the signup form asked for, Student or Staff.
   *
   * Client-writable metadata like every field around it, and revalidated at
   * this boundary. It is safe for it to be untrusted because it authorizes
   * nothing: it chooses the empty navigation an applicant is shown while they
   * wait, and somebody who forged it as STAFF would see five empty pages
   * instead of four.
   *
   * Optional rather than `| null`, unlike its neighbours. Those are facts
   * every caller of an identity may need; this one is read in exactly one
   * place, and requiring every construction of an identity to state "no kind"
   * would be ceremony for a hint whose absence already means STUDENT.
   */
  requestedKind?: JoinRequestKind | null;
};
