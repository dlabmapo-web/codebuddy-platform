import type { MemberAvatarUrls } from "@cove/shared";

import type { ProfileMediaService } from "./profile-media.service.js";

/**
 * A person's photo, resolved for a list that renders many of them.
 *
 * Six surfaces show members — the roster, the control tower's two previews, a
 * class's students, the two class pickers, and the applications table — and
 * before this each either showed initials or nothing. Wiring them one at a time
 * would have meant six copies of "select the two assets, batch-sign them, map
 * them back", and six chances to forget the batch and sign per row.
 *
 * So the select fragment and the resolution live here, together. A caller
 * spreads `memberAvatarSelect` into its Prisma query and passes the rows
 * through `resolveMemberAvatars`; nothing else has to know that an avatar is
 * two nullable assets and an OAuth URL.
 *
 * What is deliberately *not* here is the fallback order. That is
 * `resolveAvatar` in `@cove/shared`, applied in the browser at render time,
 * because removing an academy override must reveal the global photo rather than
 * copy it down — a decision this module would freeze if it picked a winner.
 */

/**
 * The columns an avatar needs, as a Prisma select fragment.
 *
 * Spread into a membership query's `select`. Written once so a surface cannot
 * ask for the academy override and forget the global one, which would silently
 * degrade to initials for anybody who set a photo on My Page but not per
 * academy.
 */
export const memberAvatarSelect = {
  user: {
    select: {
      avatarUrl: true,
      avatarAsset: { select: { id: true, bucket: true, objectKey: true } },
    },
  },
  memberProfile: {
    select: {
      avatarAsset: { select: { id: true, bucket: true, objectKey: true } },
    },
  },
} as const;

/** The shape `memberAvatarSelect` produces, for callers that map rows. */
export type MemberAvatarRow = {
  user: {
    avatarUrl: string | null;
    avatarAsset: { id: string; bucket: string; objectKey: string } | null;
  };
  memberProfile: {
    avatarAsset: { id: string; bucket: string; objectKey: string } | null;
  } | null;
};

/** An empty result, for the surfaces that resolve nothing. */
export const noMemberAvatar: MemberAvatarUrls = {
  academyImageUrl: null,
  globalImageUrl: null,
  externalAvatarUrl: null,
};

/**
 * Every avatar in a list, signed in one round trip.
 *
 * The batch is the point. Signing per row is a response-time problem at thirty
 * members and a rate-limit problem at three hundred, and both academy and
 * global assets go into the same call because a page of twenty-five people
 * needs at most fifty signatures — two round trips would be one too many.
 *
 * A signing failure yields no URLs rather than throwing. An avatar is the one
 * thing on any of these pages that can degrade without the page being wrong:
 * the chain ends in a placeholder, which always renders.
 */
export async function resolveMemberAvatars<TKey extends string>(
  media: Pick<ProfileMediaService, "signMany">,
  rows: (MemberAvatarRow & { key: TKey })[],
): Promise<Map<TKey, MemberAvatarUrls>> {
  const assets = rows.flatMap((row) => [
    ...(row.memberProfile?.avatarAsset ? [row.memberProfile.avatarAsset] : []),
    ...(row.user.avatarAsset ? [row.user.avatarAsset] : []),
  ]);

  const signed =
    assets.length === 0
      ? []
      : await media
          .signMany(assets)
          .catch(() => [] as { assetId: string; url: string }[]);
  const urlByAsset = new Map(signed.map((image) => [image.assetId, image.url]));

  return new Map(
    rows.map((row) => [
      row.key,
      {
        academyImageUrl:
          urlByAsset.get(row.memberProfile?.avatarAsset?.id ?? "") ?? null,
        globalImageUrl: urlByAsset.get(row.user.avatarAsset?.id ?? "") ?? null,
        externalAvatarUrl: row.user.avatarUrl,
      },
    ]),
  );
}
