import { z } from "zod";

/**
 * What the signup form is being filled in for.
 *
 * Not a role, and never stored as one. It decides one thing — whether Cove
 * asks for an email address — because an elementary student does not have one.
 * The academy role still comes only from a manager approving the join request,
 * so a `STAFF` signup that a manager approves as a `STUDENT` is legal, if odd.
 *
 * ## Why it is its own module
 *
 * Its own file, importing nothing but zod, for the same reason
 * `profile/avatar.ts` is: it is reachable from both sides of a pair that
 * already point at each other. `auth/session.ts` imports
 * `memberships/academy.ts` for the application summary, and `academy.ts` now
 * needs this enum to say what an application asked to be — so defining it in
 * `session.ts` closed the loop `session` → `academy` → `join-request` →
 * `session`. That type-checks perfectly and then fails at import time with a
 * temporal-dead-zone error naming none of the modules involved: the alias in
 * `join-request.ts` reads `signupKindSchema` while it is still uninitialised
 * and calls `.optional()` on `undefined`.
 *
 * A leaf cannot do that. Keep it one.
 */
export const signupKinds = ["STUDENT", "STAFF"] as const;
export const signupKindSchema = z.enum(signupKinds);
export type SignupKind = z.infer<typeof signupKindSchema>;
