'use client';

import type {
  AcademyProfileResponse,
  MyProfileResponse,
  ProfileMembership,
} from '@cove/shared';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

import { avatarSourceOf } from '@/components/studio/profile-avatar';
import { useLocale } from '@/i18n';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

import { accentStyle, roleAccent } from '@/components/studio/profile/accent';
import { ImagePicker } from './image-picker';

/**
 * The page opens on the thing it is actually about: this person, in this
 * academy, right now.
 *
 * Not a row of statistics. A profile page's first question is "is this me, and
 * is this the right place?", and the answer is a face, a name, a role, and an
 * academy — with the wash behind it taking the colour of the role, so a
 * teacher's page and a student's page are recognisable from across a room.
 */
export function IdentityCard({
  profile,
  academy,
  memberships,
  selectedAcademyId,
  onSelectAcademy,
  image,
}: {
  profile: MyProfileResponse;
  academy: AcademyProfileResponse | null;
  memberships: ProfileMembership[];
  selectedAcademyId: string | null;
  onSelectAcademy: (academyId: string) => void;
  image: {
    pending: boolean;
    error: unknown;
    onSelect: (file: File) => Promise<unknown>;
    onRemove: () => void;
  };
}) {
  const { t } = useTranslation('profile');
  const locale = useLocale();
  const role = academy?.context.role ?? 'STUDENT';

  const academyName = academy?.common.academyDisplayName ?? null;
  const globalName = profile.profile.displayName;
  const shownName = academyName ??
    globalName ??
    profile.profile.username ??
    profile.profile.email ??
    '';

  const avatar = {
    academyImageUrl: academy?.common.image?.url ?? null,
    globalImageUrl: profile.profile.image?.url ?? null,
    externalAvatarUrl: profile.profile.externalAvatarUrl,
    name: shownName,
  };
  const source = avatarSourceOf(avatar);

  return (
    <section
      className="relative overflow-hidden rounded-card border border-border bg-card"
      style={accentStyle(role)}
    >
      {/* The wash: strongest at the top left, gone by the middle. It tints the
          card without ever sitting behind body text. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[color:var(--accent-tint)] [mask-image:linear-gradient(135deg,black,transparent_62%)]"
      />

      <div className="relative flex flex-col gap-6 px-6 py-6 sm:flex-row sm:items-start sm:gap-7">
        <ImagePicker
          avatar={avatar}
          canRemove={
            academy ? Boolean(academy.common.image) : Boolean(profile.profile.image)
          }
          error={image.error}
          name={shownName}
          onRemove={image.onRemove}
          onSelect={image.onSelect}
          pending={image.pending}
          sourceKind={source.kind}
        />

        <div className="min-w-0 flex-1 space-y-3 text-center sm:text-left">
          <div className="space-y-1.5">
            <h1 className="text-[1.9rem] font-extrabold leading-[1.15] tracking-[-0.03em]">
              {shownName}
            </h1>
            {/* Only when an override is actually in play: repeating the same
                name twice teaches nobody anything. */}
            {academyName && globalName && academyName !== globalName ? (
              <p className="text-[13px] text-sub">
                {t('identity.also_known_as', { name: globalName })}
              </p>
            ) : null}
          </div>

          {academy ? (
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <span
                className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-bold uppercase tracking-[0.06em]"
                style={{
                  background: 'var(--accent-hue)',
                  color: 'var(--accent-ink)',
                }}
              >
                {t(`role.${academy.context.role}`)}
              </span>
              <span className="text-[14px] font-semibold text-ink">
                {academy.context.academyName}
              </span>
              {academy.context.joinedAt ? (
                <span className="text-[13px] text-sub">
                  {t('identity.joined', {
                    date: new Intl.DateTimeFormat(locale, {
                      year: 'numeric',
                      month: 'short',
                    }).format(new Date(academy.context.joinedAt)),
                  })}
                </span>
              ) : null}
            </div>
          ) : (
            <p className="text-[14px] text-sub">
              {t('identity.no_academy_title')}
            </p>
          )}

          {/* The only entrance to the platform console, and deliberately the
              quietest thing on this card. It is rendered for nobody else: an
              operator already knows where it is, and a link a non-admin can see
              but not open is an invitation to wonder what is behind it. */}
          {profile.profile.platformRole === 'ADMIN' ? (
            <Link
              className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold uppercase tracking-[0.08em] text-sub transition-colors hover:text-ink focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              href="/platform"
            >
              {t('platform_role.ADMIN')}
              <ArrowUpRight aria-hidden className="size-3.5" />
            </Link>
          ) : null}
        </div>
      </div>

      {/* One account, several academies, a different role in each — and each
          pill carries its own role's colour, which is the whole story in a
          strip four centimetres wide. */}
      {memberships.length > 1 ? (
        <div className="relative border-t border-border px-6 py-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-sub">
            {t('identity.switch_label')}
          </p>
          <div className="flex flex-wrap gap-2" role="group">
            {memberships.map((membership) => {
              const isSelected = membership.academyId === selectedAcademyId;
              return (
                <button
                  aria-current={isSelected ? 'true' : undefined}
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
                    isSelected
                      ? 'border-[color:var(--pill-hue)] bg-[color:var(--pill-hue)]/12 text-ink'
                      : 'border-border text-sub hover:border-[color:var(--pill-hue)]/60 hover:text-ink',
                  )}
                  key={membership.membershipId}
                  onClick={() => onSelectAcademy(membership.academyId)}
                  style={
                    {
                      '--pill-hue': roleAccent[membership.role],
                    } as React.CSSProperties
                  }
                  type="button"
                >
                  <span
                    aria-hidden
                    className="size-2 rounded-full bg-[color:var(--pill-hue)]"
                  />
                  {membership.academyName}
                  <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-sub">
                    {t(`role.${membership.role}`)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
