'use client';

import type { CourseProvenance } from '@cove/shared';
import { Archive, ArrowUpCircle, CheckCircle2, PencilLine } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const sync = {
  UP_TO_DATE: {
    icon: CheckCircle2,
    tone: 'bg-canvas text-sub',
    label: 'sync_up_to_date',
  },
  UPDATE_AVAILABLE: {
    icon: ArrowUpCircle,
    tone: 'bg-brand-soft text-brand',
    label: 'sync_update_available',
    hint: 'update_hint',
  },
  SOURCE_RETIRED: {
    icon: Archive,
    tone: 'bg-retired-soft text-retired',
    label: 'sync_source_retired',
    hint: 'retired_hint',
  },
} as const satisfies Record<
  CourseProvenance['syncState'],
  { icon: LucideIcon; tone: string; label: string; hint?: string }
>;

/**
 * Where a copy stands against its master, and whether this academy has edited
 * it since.
 *
 * Two chips, never one. The states are independent axes — head office moving
 * on says nothing about whether this academy has touched its copy — and the
 * combination that matters most is both at once, which is precisely when
 * taking a fresh copy would throw this academy's own work away. A single
 * merged label would need six strings and none of them would scan.
 *
 * `UP_TO_DATE` is deliberately the quietest. It is the ordinary state of most
 * rows, and a green tick on every line is a tick nobody reads.
 */
export function ProvenanceChips({
  provenance,
}: {
  provenance: CourseProvenance;
}) {
  const { t } = useTranslation('academy-library');
  const state = sync[provenance.syncState];
  const Icon = state.icon;
  const hint = 'hint' in state ? t(state.hint) : undefined;

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-bold ${state.tone}`}
        title={hint}
      >
        <Icon className="size-3.5" strokeWidth={2.5} />
        {t(state.label)}
      </span>
      {provenance.isCustomized ? (
        <span
          className="inline-flex items-center gap-1.5 rounded-full bg-course-b-soft px-2.5 py-1 text-[12.5px] font-bold text-course-b"
          title={t('customized_hint')}
        >
          <PencilLine className="size-3.5" strokeWidth={2.5} />
          {t('customized')}
        </span>
      ) : null}
    </span>
  );
}

/** One quiet line of attribution, under a copied course's title. */
export function ProvenanceLine({
  provenance,
}: {
  provenance: CourseProvenance;
}) {
  const { t } = useTranslation('academy-library');
  return (
    <span className="text-[12.5px] font-semibold text-sub">
      {t('from', { title: provenance.sourceTitle })}
    </span>
  );
}
