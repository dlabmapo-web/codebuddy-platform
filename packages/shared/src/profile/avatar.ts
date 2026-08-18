import { z } from "zod";

/**
 * The three inputs a person's avatar is resolved from, on the wire.
 *
 * Its own module, importing nothing but zod, and that is the whole point.
 * Every payload that carries a person spreads this — the roster, the class
 * roster, both class pickers, the applications list, the control tower's two
 * previews — which means it is reachable from `memberships`, `classes`, and
 * `content` alike. Living in `profile.ts` beside the schemas that import
 * `auth/session.js` made it a cycle the moment `memberships/academy.ts` used
 * it: `session` → `academy` → `profile` → `session`, which type-checks
 * perfectly and then fails at import time with a temporal-dead-zone error that
 * names none of the modules involved.
 *
 * A leaf cannot do that. Keep it one.
 *
 * Three fields rather than one resolved URL because the fallback is a
 * *read-time* decision — removing an academy override reveals the global photo
 * rather than copying it down, and a pre-resolved `imageUrl` could not express
 * that. The two signed URLs also expire, so they are minted per response.
 */
export const memberAvatarUrlsSchema = z
  .object({
    academyImageUrl: z.string().nullable(),
    globalImageUrl: z.string().nullable(),
    externalAvatarUrl: z.string().nullable(),
  })
  .strict();
export type MemberAvatarUrls = z.infer<typeof memberAvatarUrlsSchema>;

/** The same three fields, for schemas that extend rather than merge. */
export const memberAvatarUrlsShape = memberAvatarUrlsSchema.shape;
