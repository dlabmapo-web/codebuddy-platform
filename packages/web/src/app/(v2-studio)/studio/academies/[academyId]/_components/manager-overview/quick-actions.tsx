'use client';

import {
  Building2,
  FileSpreadsheet,
  LayoutGrid,
  Mail,
  Rocket,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { Panel, toneStyles, type PanelTone } from '../overview-ui/panel';

/**
 * The work a manager starts, rather than the work waiting for them.
 *
 * At the bottom on purpose, which is the opposite of where a quick-actions
 * strip usually goes. The page's argument runs from "what needs deciding"
 * through the evidence to "what you might start", and putting a row of buttons
 * at the top would answer a question the manager has not asked yet — and would
 * compete with the action queue, which is the same shape and actually urgent.
 *
 * Each tile takes the hue of the section it belongs to, so the strip reads as a
 * summary of the page above rather than as five unrelated buttons: orange is
 * people work, violet is classes, blue is the academy itself.
 *
 * The profile tile appears only when the profile is incomplete. A permanent
 * "complete your profile" button on a complete profile is how a manager learns
 * to stop reading this strip.
 */
export function QuickActions({
  academyId,
  profileIncomplete,
  onEditProfile,
}: {
  academyId: string;
  profileIncomplete: boolean;
  onEditProfile: () => void;
}) {
  const { t } = useTranslation('manager');
  const base = `/studio/academies/${academyId}`;

  return (
    <Panel
      description={t('actions.description')}
      icon={Rocket}
      id="manager-actions"
      testId="manager-actions"
      title={t('actions.title')}
      tone="teal"
    >
      <ul className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-3">
        <ActionTile
          caption={t('actions.invite_caption')}
          href={`${base}/invitations`}
          icon={Mail}
          label={t('actions.invite')}
          tone="primary"
        />
        <ActionTile
          caption={t('actions.people_caption')}
          href={`${base}/members`}
          icon={Users}
          label={t('actions.people')}
          tone="brand"
        />
        <ActionTile
          caption={t('actions.import_caption')}
          // The wizard opens from the directory rather than from here: it needs
          // the page's filters and revision, and a second entry point would be
          // a second place for that state to be assembled.
          href={`${base}/members`}
          icon={FileSpreadsheet}
          label={t('actions.import')}
          tone="teal"
        />
        <ActionTile
          caption={t('actions.class_caption')}
          href={`${base}/classes`}
          icon={LayoutGrid}
          label={t('actions.class')}
          tone="peer"
        />
        {profileIncomplete ? (
          <ActionTile
            caption={t('actions.profile_caption')}
            icon={Building2}
            label={t('actions.profile')}
            onClick={onEditProfile}
            tone="warning"
          />
        ) : (
          <ActionTile
            caption={t('actions.applications_caption')}
            href={`${base}/applications`}
            icon={Users}
            label={t('actions.applications')}
            tone="teal"
          />
        )}
      </ul>
    </Panel>
  );
}

/**
 * One tile, as a link or as a button.
 *
 * Two elements rather than one styled to look like both: a route is a link and
 * belongs in a new tab if a manager wants it there, while opening the profile
 * form navigates nowhere and must not offer to. Making the wrong one look right
 * is how a product ends up with links that break the middle-click.
 */
function ActionTile({
  caption,
  href,
  icon: Icon,
  label,
  onClick,
  tone,
}: {
  caption: string;
  href?: string;
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  tone: PanelTone;
}) {
  const styles = toneStyles[tone];
  const inner = (
    <>
      <span
        aria-hidden
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-xl transition-transform',
          'group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100',
          styles.chip,
        )}
      >
        <Icon className="size-4.5" strokeWidth={2.25} />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-bold leading-snug">{label}</span>
        <span className="mt-0.5 block text-[11.5px] leading-[1.5] text-sub">
          {caption}
        </span>
      </span>
    </>
  );

  const className = cn(
    'group flex h-full w-full items-start gap-3 bg-card p-4 text-left transition-colors',
    'hover:bg-accent/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
  );

  return (
    <li>
      {href ? (
        <Link className={className} href={href}>
          {inner}
        </Link>
      ) : (
        <button className={className} onClick={onClick} type="button">
          {inner}
        </button>
      )}
    </li>
  );
}
