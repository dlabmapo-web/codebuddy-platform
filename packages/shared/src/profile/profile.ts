import { z } from "zod";

import { academyRoleSchema, platformRoleSchema } from "../auth/roles.js";
import { userStatusSchema } from "../auth/session.js";
import { membershipStatusSchema } from "../memberships/status.js";
import { optionalPhone, optionalText, safeText } from "./text.js";

/**
 * The global account half of My Page.
 *
 * Everything here belongs to the person, not to an academy. A manager never
 * appears in this file: `docs/superpowers/specs/2026-08-14-my-page-account-
 * academy-profile-design.md` §7.1 makes global identity user-owned, because
 * one academy editing it would change who that person is in every other one.
 */

/**
 * A profile image as the API hands it out: an identity plus a short-lived URL.
 *
 * The URL is response data and nothing else. It is never written back into a
 * Cove table — a persisted signed URL is a public URL with extra steps, and it
 * outlives the authorization that produced it.
 */
export const profileImageSchema = z.object({
  assetId: z.uuid(),
  url: z.string().min(1),
  expiresAt: z.iso.datetime(),
});
export type ProfileImage = z.infer<typeof profileImageSchema>;

export const profileLocales = ["en", "ko"] as const;
export const profileLocaleSchema = z.enum(profileLocales);
export type ProfileLocale = z.infer<typeof profileLocaleSchema>;

export const displayNameSchema = safeText(60);
export const optionalDisplayNameSchema = optionalText(60);

/**
 * An IANA zone name, validated by asking the platform rather than by carrying
 * a list. A hardcoded list goes stale every time a government moves a border.
 */
export const timezoneSchema = z
  .string()
  .trim()
  .max(64)
  .nullable()
  .transform((value, ctx) => {
    if (!value) return null;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: value });
      return value;
    } catch {
      ctx.addIssue({ code: "custom", message: "must be an IANA time zone" });
      return z.NEVER;
    }
  });

/**
 * What the account can actually do about its own credentials.
 *
 * Reported rather than inferred in the browser. An OAuth-only account has no
 * password to change, and offering the form anyway produces a control that
 * fails only after the person has typed a new password twice.
 */
export const accountSecuritySchema = z.object({
  hasPasswordIdentity: z.boolean(),
  connectedProviders: z.array(z.string().min(1)),
  emailVerified: z.boolean(),
  /**
   * First release: Cove reports session state, it does not revoke sessions.
   * The flag exists so the page can say so plainly instead of rendering a
   * button that does nothing. See design §17.
   */
  sessionManagementAvailable: z.boolean(),
  /** Same reasoning for the contact phone: stored, not yet verified. */
  phoneVerificationAvailable: z.boolean(),
  lastSignInAt: z.iso.datetime().nullable(),
});
export type AccountSecurity = z.infer<typeof accountSecuritySchema>;

/** One academy the account belongs to, as the account summary lists it. */
export const profileMembershipSchema = z.object({
  membershipId: z.uuid(),
  academyId: z.uuid(),
  academyName: z.string().min(1),
  academySlug: z.string().min(1),
  role: academyRoleSchema,
  status: membershipStatusSchema,
  joinedAt: z.iso.datetime().nullable(),
});
export type ProfileMembership = z.infer<typeof profileMembershipSchema>;

export const globalProfileSchema = z.object({
  userId: z.uuid(),
  /** Immutable after the initial claim, so the page shows it and no field. */
  username: z.string().nullable(),
  email: z.email().nullable(),
  displayName: z.string().nullable(),
  contactPhone: z.string().nullable(),
  /** A Cove-owned, privately stored image. Authoritative when present. */
  image: profileImageSchema.nullable(),
  /** The OAuth photo Cove never copied. The last fallback before initials. */
  externalAvatarUrl: z.string().nullable(),
  platformRole: platformRoleSchema,
  status: userStatusSchema,
  preferredLocale: profileLocaleSchema,
  timezone: z.string().nullable(),
  createdAt: z.iso.datetime(),
  /** The revision an edit must name to be applied. See design §11. */
  updatedAt: z.iso.datetime(),
});
export type GlobalProfile = z.infer<typeof globalProfileSchema>;

export const myProfileResponseSchema = z.object({
  profile: globalProfileSchema,
  security: accountSecuritySchema,
  memberships: z.array(profileMembershipSchema),
});
export type MyProfileResponse = z.infer<typeof myProfileResponseSchema>;

/* ------------------------------------------------------------------ inputs */

/**
 * The revision the form loaded. A mismatch is answered with `PROFILE_CHANGED`
 * and the draft is kept, rather than the later save quietly winning.
 */
const expectedUpdatedAtSchema = z.iso.datetime();

export const updateGlobalProfileSchema = z.object({
  displayName: optionalDisplayNameSchema,
  contactPhone: optionalPhone,
  expectedUpdatedAt: expectedUpdatedAtSchema,
});

export const updatePreferencesSchema = z.object({
  preferredLocale: profileLocaleSchema,
  timezone: timezoneSchema,
  expectedUpdatedAt: expectedUpdatedAtSchema,
});

/* ----------------------------------------------------------------- helpers */

export type AvatarSource =
  | { kind: "academy" | "global" | "external"; url: string }
  | { kind: "initials"; initials: string };

/**
 * The one fallback order, written once. Design §10.4: academy image, then the
 * global Cove image, then the external OAuth photo, then generated initials.
 *
 * Removing an academy override *reveals* the global image; it never copies it
 * down, which is why this is a read-time decision and not a stored column.
 */
export function resolveAvatar(input: {
  academyImageUrl?: string | null;
  globalImageUrl?: string | null;
  externalAvatarUrl?: string | null;
  name?: string | null;
}): AvatarSource {
  if (input.academyImageUrl) {
    return { kind: "academy", url: input.academyImageUrl };
  }
  if (input.globalImageUrl) return { kind: "global", url: input.globalImageUrl };
  if (input.externalAvatarUrl) {
    return { kind: "external", url: input.externalAvatarUrl };
  }
  return { kind: "initials", initials: initialsOf(input.name) };
}

/**
 * At most two characters. Korean names have no space to split on, so the
 * first grapheme is taken; Latin names use the first letter of the first and
 * last word, which is what a reader expects from `Jurabek Samiev`.
 */
export function initialsOf(name: string | null | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) return "?";
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    return [...words[0]!].slice(0, /^[\p{Script=Hangul}]/u.test(words[0]!) ? 1 : 2)
      .join("")
      .toUpperCase();
  }
  const first = [...words[0]!][0] ?? "";
  const last = [...words[words.length - 1]!][0] ?? "";
  return `${first}${last}`.toUpperCase();
}

/**
 * The name to show for a person in an academy context: the academy override
 * first, then the global display name, then the sign-in handle. Never an empty
 * string — a roster row with no name is a row nobody can act on.
 */
export function resolveDisplayName(input: {
  academyDisplayName?: string | null;
  displayName?: string | null;
  username?: string | null;
  email?: string | null;
  fallback: string;
}): string {
  return (
    input.academyDisplayName?.trim() ||
    input.displayName?.trim() ||
    input.username?.trim() ||
    input.email?.split("@")[0]?.trim() ||
    input.fallback
  );
}
