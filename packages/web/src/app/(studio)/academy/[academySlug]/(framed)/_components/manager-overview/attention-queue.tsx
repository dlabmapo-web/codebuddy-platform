'use client';

import { routes } from '@/lib/routes';

import { useAcademySlug } from '@/components/studio/academy-route-provider';

import type { ManagerActionQueue } from '@cove/shared';
import {
  ArrowRight,
  ClipboardCheck,
  LayoutGrid,
  ListChecks,
  MailWarning,
  PartyPopper,
  UserRoundSearch,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { ProfileAvatar } from '@/components/studio/profile-avatar';
import { cn } from '@/lib/utils';

import { classGapIcons } from '../../_lib/manager-view';
import {
  attentionIcons,
  attentionReasonDisplayValue,
  attentionTones,
} from '../../_lib/overview-view';
import { EmptyState, Panel } from '../overview-ui/panel';

/**
 * Everything waiting on a manager, as a stack of decisions.
 *
 * The previous version put the count, the evidence, and the action at the same
 * visual level and painted all three in the section's orange. Twelve incomplete
 * classes produced fifteen filled orange chips in a block, the "Open classes"
 * button floated vertically centred beside a five-row list belonging to
 * nothing, and the two groups ran together with no boundary. The result was a
 * wall: everything shouted, so nothing did.
 *
 * Three rules fix it, and they are worth stating because the next section added
 * here will be tempted to break them.
 *
 * **One loud thing per card.** The count is the finding and it is set large.
 * The evidence beneath it is quiet — `text-sub`, no fill, separated by
 * middots. A manager reads "12 classes are not ready", decides whether to care,
 * and only then reads which ones.
 *
 * **Orange is the section, not the contents.** The rail, the icon chip, and the
 * count carry the hue. Nothing else does. Painting the evidence too is what
 * destroyed the signal: when fifteen things are urgent, none is.
 *
 * **The action belongs to its card.** Each button sits in the header of the
 * item it acts on, so "Open classes" is unambiguously about the twelve classes
 * named directly beneath it.
 *
 * The one exception is a student's attention reasons, which keep their own
 * per-reason hues from `attentionTones`. Those colours mean something specific
 * — a repeated failure is not a quiet fortnight — and §16 requires the icon and
 * the measurement beside them so the colour is never the only signal.
 */
export function AttentionQueue({
  academyId,
  isStale,
  queue,
}: {
  academyId: string;
  isStale: boolean;
  queue: ManagerActionQueue;
}) {
  const academySlug = useAcademySlug();
  const { t } = useTranslation('manager');
  const base = `${routes.academy(academySlug)}`;

  const total =
    queue.pendingApplications +
    queue.expiringInvitations +
    queue.incompleteClasses.total +
    queue.studentsNeedingAttention.total;

  return (
    <Panel
      description={t('queue.description')}
      icon={ListChecks}
      id="manager-queue"
      meta={total > 0 ? t('queue.meta', { count: total }) : undefined}
      testId="manager-queue"
      title={t('queue.title')}
      tone="primary"
    >
      {total === 0 ? (
        <EmptyState
          body={t('queue.empty_body')}
          icon={PartyPopper}
          title={t('queue.empty_title')}
          tone="success"
        />
      ) : (
        <div className="flex flex-col gap-px bg-border">
          {queue.pendingApplications > 0 ? (
            <QueueCard
              action={t('queue.applications_action')}
              count={queue.pendingApplications}
              href={`${base}/applications`}
              icon={ClipboardCheck}
              isStale={isStale}
              title={t('queue.applications', {
                count: queue.pendingApplications,
              })}
            />
          ) : null}

          {queue.expiringInvitations > 0 ? (
            <QueueCard
              action={t('queue.invitations_action')}
              caption={t('queue.invitations_caption', {
                count: queue.pendingInvitations,
              })}
              count={queue.expiringInvitations}
              href={`${base}/invitations`}
              icon={MailWarning}
              isStale={isStale}
              title={t('queue.invitations', {
                count: queue.expiringInvitations,
              })}
            />
          ) : null}

          {queue.incompleteClasses.total > 0 ? (
            <QueueCard
              action={t('queue.classes_action')}
              count={queue.incompleteClasses.total}
              href={`${base}/classes`}
              icon={LayoutGrid}
              isStale={isStale}
              remaining={
                queue.incompleteClasses.total -
                queue.incompleteClasses.preview.length
              }
              title={t('queue.classes', {
                count: queue.incompleteClasses.total,
              })}
            >
              <ul className="flex flex-col divide-y divide-border/70">
                {queue.incompleteClasses.preview.map((row) => (
                  <li
                    className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 py-2 first:pt-0 last:pb-0"
                    key={row.classId}
                  >
                    <span className="truncate text-[13px] font-bold">
                      {row.className}
                    </span>
                    {/*
                     * What is missing, as one quiet line rather than three
                     * filled chips. The card header already said these need
                     * attention; repeating that in colour on every attribute is
                     * what made the old list unreadable.
                     */}
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-sub">
                      {row.gaps.map((gap, index) => {
                        const GapIcon = classGapIcons[gap];
                        return (
                          <span className="flex items-center gap-1" key={gap}>
                            {index > 0 ? (
                              <span aria-hidden className="text-border">
                                ·
                              </span>
                            ) : null}
                            <GapIcon
                              aria-hidden
                              className="size-3 shrink-0"
                              strokeWidth={2.25}
                            />
                            {t(`queue.gap.${gap}`)}
                          </span>
                        );
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </QueueCard>
          ) : null}

          {queue.studentsNeedingAttention.total > 0 ? (
            <QueueCard
              caption={t('queue.students_caption')}
              count={queue.studentsNeedingAttention.total}
              icon={UserRoundSearch}
              isStale={isStale}
              remaining={
                queue.studentsNeedingAttention.total -
                queue.studentsNeedingAttention.preview.length
              }
              title={t('queue.students', {
                count: queue.studentsNeedingAttention.total,
              })}
            >
              <ul className="flex flex-col divide-y divide-border/70">
                {queue.studentsNeedingAttention.preview.map((student) => (
                  <li
                    className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0"
                    key={student.membershipId}
                  >
                    {/*
                     * Two lines, not one. The old row ran the name, the class,
                     * and up to four measured reasons across a single line, so
                     * a student with four reasons pushed the next student's
                     * name off the eye's return path entirely.
                     */}
                    <span className="flex min-w-0 items-center gap-2">
                      <ProfileAvatar
                        academyImageUrl={student.academyImageUrl}
                        externalAvatarUrl={student.externalAvatarUrl}
                        globalImageUrl={student.globalImageUrl}
                        name={student.displayName}
                        size="sm"
                      />
                      <span className="truncate text-[13px] font-bold">
                        {student.displayName}
                      </span>
                      {student.className ? (
                        <span className="truncate text-[11.5px] text-sub">
                          {student.className}
                        </span>
                      ) : null}
                    </span>

                    {/*
                     * Every reason carries the measurement that produced it.
                     * §9.8 — a signal a manager cannot explain to the student's
                     * teacher is not a signal, and a bare badge would be a
                     * severity score by another name. These keep their hues
                     * because the five reasons genuinely differ; the icon and
                     * the number are what stop the colour standing alone.
                     */}
                    <span className="flex flex-wrap gap-1.5 pl-10">
                      {student.reasons.map((reason) => {
                        const ReasonIcon = attentionIcons[reason.kind];
                        return (
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
                              attentionTones[reason.kind],
                            )}
                            key={reason.kind}
                          >
                            <ReasonIcon
                              aria-hidden
                              className="size-3 shrink-0"
                              strokeWidth={2.5}
                            />
                            {t(`queue.reason.${reason.kind}`, {
                              count: attentionReasonDisplayValue(reason),
                            })}
                          </span>
                        );
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </QueueCard>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

/**
 * One decision: what it is, how much of it, and the way in.
 *
 * The count is a figure rather than part of the sentence because it is the only
 * thing on the card a manager reads before deciding whether to read the rest.
 * The heading still spells it out — "12 classes are not ready to teach" — so
 * the number is never the only place the quantity appears, and a screen reader
 * hears one coherent phrase rather than a bare digit.
 *
 * `remaining` is the honest footer for a preview. A list of five under a count
 * of twelve, with nothing saying so, reads as a list of twelve that lost seven.
 */
function QueueCard({
  action,
  caption,
  children,
  count,
  href,
  icon: Icon,
  isStale,
  remaining = 0,
  title,
}: {
  action?: string;
  caption?: string;
  children?: React.ReactNode;
  count: number;
  href?: string;
  icon: LucideIcon;
  isStale: boolean;
  remaining?: number;
  title: string;
}) {
  const { t } = useTranslation('manager');

  return (
    <section className="bg-card px-4 py-3.5">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
        >
          <Icon className="size-4.5" strokeWidth={2.25} />
        </span>

        <span
          aria-hidden
          className="font-mono text-[22px] font-extrabold leading-none tabular-nums text-primary"
        >
          {count}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-bold leading-snug">
            {title}
          </span>
          {caption ? (
            <span className="mt-0.5 block text-[11.5px] text-sub">{caption}</span>
          ) : null}
        </span>

        {href && action ? (
          <Link
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-primary px-3',
              'text-[12.5px] font-bold text-on-primary transition-opacity hover:opacity-90',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              // A drill-down opened from stale numbers lands on a scope the
              // manager was not looking at.
              isStale && 'pointer-events-none opacity-50',
            )}
            href={href}
            tabIndex={isStale ? -1 : undefined}
          >
            {action}
            <ArrowRight aria-hidden className="size-3.5" strokeWidth={2.5} />
          </Link>
        ) : null}
      </header>

      {children ? (
        <div className="mt-3 border-t border-border pt-2.5">{children}</div>
      ) : null}

      {remaining > 0 ? (
        <p className="mt-2 text-[11.5px] text-sub">
          {t('queue.and_more', { count: remaining })}
        </p>
      ) : null}
    </section>
  );
}
