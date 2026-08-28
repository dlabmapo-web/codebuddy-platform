'use client';

import { useAcademySlug } from '@/components/studio/academy-route-provider';

import type { BlockerGroup } from '@cove/shared';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { blockerHref, blockerIcons, blockerTones } from '../../_lib/lead-view';
import { EmptyState, toneStyles } from '../overview-ui/panel';

/**
 * What is broken, grouped by what kind of broken it is.
 *
 * Groups rather than one flat list of defects. A Team Lead fixing ungradeable
 * exercises is in one frame of mind and one part of the product; a Team Lead
 * assigning a teacher is in another. A single list sorted by severity would
 * make them alternate between the two all the way down, and the seven headings
 * are what let somebody clear a whole kind in one sitting.
 *
 * Every group states its true total and previews at most five. A group that
 * showed only five and said nothing else would let an academy with forty
 * ungradeable exercises look like an academy with five.
 *
 * Order is declared in `@cove/shared`, never derived from the counts. A queue
 * that reshuffled itself as you fixed it is one you cannot learn.
 */
export function BlockerQueue({
  academyId,
  groups,
}: {
  academyId: string;
  groups: BlockerGroup[];
}) {
  const academySlug = useAcademySlug();
  const { t } = useTranslation('lead');

  if (groups.length === 0) {
    return (
      <EmptyState
        body={t('blockers.empty_body')}
        icon={ShieldCheck}
        title={t('blockers.empty_title')}
        tone="success"
      />
    );
  }

  return (
    <ul className="divide-y divide-border">
      {groups.map((group) => {
        const tone = toneStyles[blockerTones[group.kind]];
        const Icon = blockerIcons[group.kind];

        return (
          <li key={group.kind}>
            <div className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 pb-2.5 pt-3.5">
              <span
                aria-hidden
                className={cn(
                  'grid size-8 shrink-0 place-items-center rounded-lg',
                  tone.chip,
                )}
              >
                <Icon className="size-4" strokeWidth={2.25} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h3 className="text-[13.5px] font-bold">
                    {t(`blockers.kind.${group.kind}.title`)}
                  </h3>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 font-mono text-[11px] font-bold tabular-nums',
                      tone.pill,
                    )}
                  >
                    {group.total}
                  </span>
                </div>
                <p className="mt-0.5 text-[12px] leading-[1.5] text-sub">
                  {t(`blockers.kind.${group.kind}.body`)}
                </p>
                {/*
                 * The consequence, stated per group rather than per row. Zero is
                 * printed rather than hidden: a defect that reaches nobody yet is
                 * still worth fixing, and saying so is what stops the reader
                 * assuming every row is an emergency.
                 */}
                <p className="mt-1 text-[11.5px] font-semibold text-sub">
                  {group.studentsAffected > 0
                    ? t('blockers.students_affected', {
                        count: group.studentsAffected,
                      })
                    : t('blockers.students_none')}
                </p>
              </div>
            </div>

            <ul className="pb-3.5">
              {group.preview.map((row) => {
                const href = blockerHref(academySlug, row.target);
                const body = (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-ink">
                        {row.label}
                      </span>
                      {row.context ? (
                        <span className="block truncate text-[11.5px] text-sub">
                          {row.context}
                        </span>
                      ) : null}
                    </span>
                    {row.studentsAffected > 0 ? (
                      <span className="shrink-0 font-mono text-[11.5px] font-bold tabular-nums text-sub">
                        {t('blockers.row_students', {
                          count: row.studentsAffected,
                        })}
                      </span>
                    ) : null}
                    {href ? (
                      <ArrowRight
                        aria-hidden
                        className="size-4 shrink-0 text-sub transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                      />
                    ) : null}
                  </>
                );

                return (
                  <li key={row.id}>
                    {href ? (
                      <Link
                        className={cn(
                          'group mx-4 flex items-center gap-3 rounded-lg px-3 py-2 transition-colors',
                          'hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                        )}
                        href={href}
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className="mx-4 flex items-center gap-3 px-3 py-2">
                        {body}
                      </div>
                    )}
                  </li>
                );
              })}

              {group.total > group.preview.length ? (
                <li className="px-7 pt-1.5">
                  <p className="text-[11.5px] font-semibold text-sub">
                    {t('blockers.more', {
                      count: group.total - group.preview.length,
                    })}
                  </p>
                </li>
              ) : null}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}
