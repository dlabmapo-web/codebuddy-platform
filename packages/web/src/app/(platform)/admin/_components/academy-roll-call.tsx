'use client';

import type { PlatformAcademySummary } from '@cove/shared';
import { ArrowRight, ListChecks, PartyPopper } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { routes } from '@/lib/routes';

import {
  EmptyState,
  Panel,
} from '@/app/(studio)/academy/[academySlug]/_components/overview-ui/panel';
import {
  academyCondition,
  stakesParts,
} from '../_lib/platform-view';
import { AcademyStateBadge } from './academy-state-badge';

/**
 * Everything waiting on an operator, as a stack of decisions.
 *
 * The manager's control tower already answers "what needs me" for one academy,
 * and this is the same question one level up — so it is the same panel, the
 * same orange, and the same three rules that panel states:
 *
 * **One loud thing per row.** The academy's name is the finding. The evidence
 * beneath it is quiet, separated by middots, and read only by an operator who
 * has decided to care.
 *
 * **Orange is the section, not the contents.** The rail and the header chip
 * carry the hue. A row's own badge keeps its condition's colour because that
 * colour means something specific — a leaderless academy is not a new one —
 * and the word beside it says the same thing without relying on hue.
 *
 * **The action belongs to its row.** The button sits in the row it acts on, so
 * "Invite a manager" is unambiguously about the academy named beside it.
 *
 * The stakes line is this page's own addition: "no manager" is administrative
 * until you read that 340 students are still enrolled underneath it.
 */
export function AcademyRollCall({
  academies,
}: {
  academies: PlatformAcademySummary[];
}) {
  const { t } = useTranslation('platform');

  return (
    <Panel
      description={t('roll_call.description')}
      icon={ListChecks}
      id="platform-roll-call"
      meta={academies.length > 0 ? String(academies.length) : undefined}
      title={t('roll_call.title')}
      tone="primary"
    >
      {academies.length === 0 ? (
        <EmptyState
          body={t('empty.settled_body')}
          icon={PartyPopper}
          title={t('empty.settled_title')}
          tone="success"
        />
      ) : (
        <ul className="divide-y divide-border">
          {academies.map((academy) => (
            <AcademyRow academy={academy} key={academy.id} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function AcademyRow({ academy }: { academy: PlatformAcademySummary }) {
  const { t } = useTranslation('platform');
  const condition = academyCondition(academy);
  const stakes = stakesParts(academy.memberCounts);
  const invitation = academy.pendingManagerInvitation;

  const evidence: string[] = [
    stakes.length === 0
      ? t('roll_call.stakes_empty')
      : stakes
          .map((part) =>
            t(`roles.${part.key}` as 'roles.students', { count: part.count }),
          )
          .join(' · '),
  ];
  if (invitation) {
    evidence.push(t('roll_call.invited', { email: invitation.email }));
  }

  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="text-[14.5px] font-bold text-ink">
            {academy.name}
          </span>
          <span className="font-mono text-[12px] text-sub">/{academy.slug}</span>
          <AcademyStateBadge academy={academy} />
        </div>
        <p className="mt-1 text-[13px] leading-[1.6] text-sub">
          {t(`roll_call.${condition}_body` as 'roll_call.no_active_manager_body')}
        </p>
        <p className="mt-1 text-[12.5px] text-sub">
          {evidence.map((part, index) => (
            <span key={part}>
              {index > 0 ? (
                <span aria-hidden className="px-1.5 text-sub/50">
                  ·
                </span>
              ) : null}
              <span
                className={cn(
                  index === 1 && invitation?.isExpired && 'text-warning',
                )}
              >
                {part}
              </span>
            </span>
          ))}
        </p>
      </div>

      <Link
        className={cn(
          'group inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 text-[13.5px] font-bold transition-colors',
          condition === 'no_active_manager'
            ? 'bg-primary text-on-primary hover:bg-primary-hover'
            : 'bg-brand-soft text-brand hover:bg-brand hover:text-on-brand',
        )}
        href={routes.adminAcademy(academy.slug)}
      >
        {condition === 'no_active_manager'
          ? t('roll_call.action_invite')
          : condition === 'awaiting_first_manager'
            ? t('roll_call.action_resend')
            : t('roll_call.action_open')}
        <ArrowRight
          aria-hidden
          className="size-3.5 transition-transform group-hover:translate-x-0.5"
        />
      </Link>
    </li>
  );
}
