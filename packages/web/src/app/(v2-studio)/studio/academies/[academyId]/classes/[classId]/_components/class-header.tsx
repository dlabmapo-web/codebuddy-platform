'use client';

import { Archive, ArrowLeft, Pencil, RotateCcw } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/studio/button';
import { useLayoutTranslation } from '@/i18n';

import { ClassStatusBadge } from '../../_components/class-status-badge';
import type { ClassDetailManagerState } from '../_hooks/use-class-detail-manager';

export function ClassHeader({
  academyId,
  manager,
}: {
  academyId: string;
  manager: ClassDetailManagerState;
}) {
  const { t } = useLayoutTranslation('classes');
  const { detail } = manager;
  const archived = detail.status === 'ARCHIVED';

  return (
    <header className="space-y-4">
      <Link
        className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-sub transition-colors hover:text-brand"
        href={`/studio/academies/${academyId}/classes`}
      >
        <ArrowLeft className="size-3.5" />
        {t('detail.back')}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[1.7rem] font-extrabold leading-tight">
              {detail.name}
            </h1>
            <ClassStatusBadge status={detail.status} />
          </div>
          <p className="mt-2 max-w-2xl text-[15px] leading-[1.65] text-sub">
            {detail.description || t('no_description')}
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <Button
            disabled={archived}
            onClick={manager.openEdit}
            variant="outline"
          >
            <Pencil />
            {t('edit')}
          </Button>
          {/* Restoring is reversible and grants nothing new, so it acts at
              once; archiving revokes access and goes through a dialog. */}
          <Button
            disabled={manager.statusPending}
            onClick={archived ? manager.restore : manager.openArchive}
            variant="outline"
          >
            {archived ? <RotateCcw /> : <Archive />}
            {archived ? t('restore') : t('archive')}
          </Button>
        </div>
      </div>

      {archived ? (
        <p className="rounded-card border border-retired/20 bg-retired-soft px-4 py-3 text-[14px] font-semibold text-retired">
          {t('detail.archived_notice')}
        </p>
      ) : null}
    </header>
  );
}
