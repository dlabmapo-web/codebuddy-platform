'use client';

import { routes } from '@/lib/routes';

import { useAcademySlug } from '@/components/studio/academy-route-provider';

import type { StudentRecord } from '@cove/shared';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowRight, Check, History, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';

import { DataTable } from '@/components/studio/data-table';
import { rememberProgrammaticExerciseNavigation } from '@/components/workspace/tracked-exercise-link';
import { cn } from '@/lib/utils';

import { Duration, EmptyState, Panel, useRelativeDay } from './student-primitives';

/**
 * The last few attempts, and a way into all of them.
 *
 * A preview of a page that already exists, sharing its definitions: `PASSED`
 * and `FAILED` only, newest first, and the same labels the record was written
 * under so a renamed course does not rewrite what the student solved last
 * term. Anything more belongs on Answer records, which is one link away.
 *
 * A table rather than a list because every row holds the same four
 * measurements and the reader is comparing them down the column — the same
 * reason Difficult problems and the score previews are tables on the teacher's
 * overview, while its Teaching queue is not.
 *
 * Sorting is off. Five rows in submission order are a recent history; five
 * rows re-sorted by score are a ranking of the student's own work, which is a
 * different claim and belongs on the page that can page through all of it.
 */
export function RecentAttempts({
  academyId,
  isStale,
  records,
}: {
  academyId: string;
  isStale: boolean;
  records: StudentRecord[];
}) {
  const academySlug = useAcademySlug();
  const { t } = useTranslation('learning');
  const router = useRouter();
  const relativeDay = useRelativeDay();

  const hrefFor = (record: StudentRecord) =>
    record.materialId
      ? routes.academyLearnExercise(academySlug, record.materialId, {
          submission: record.id,
        })
      : null;

  const columns: ColumnDef<StudentRecord, unknown>[] = [
    {
      id: 'verdict',
      header: t('records.column_result'),
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className={cn(
              'grid size-6 shrink-0 place-items-center rounded-full',
              row.original.passed
                ? 'bg-success/10 text-success'
                : 'bg-danger/10 text-danger',
            )}
          >
            {row.original.passed ? (
              <Check className="size-3.5" strokeWidth={3} />
            ) : (
              <X className="size-3.5" strokeWidth={3} />
            )}
          </span>
          <span
            className={cn(
              'text-[12px] font-bold',
              row.original.passed ? 'text-success' : 'text-danger',
            )}
          >
            {row.original.passed ? t('records.passed') : t('records.failed')}
          </span>
        </span>
      ),
    },
    {
      accessorKey: 'problemTitle',
      header: t('records.column_problem'),
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <span className="block min-w-0">
          <span className="block truncate text-[13.5px] font-semibold">
            {row.original.problemTitle}
          </span>
          <span className="block truncate text-[11.5px] text-sub">
            {row.original.courseTitle}
          </span>
        </span>
      ),
    },
    {
      accessorKey: 'solveElapsedSec',
      header: () => <NumericHeader>{t('records.column_time')}</NumericHeader>,
      enableSorting: false,
      cell: ({ row }) => (
        <NumericCell className="text-sub">
          <Duration seconds={row.original.solveElapsedSec} />
        </NumericCell>
      ),
    },
    {
      accessorKey: 'score',
      header: () => <NumericHeader>{t('records.column_score')}</NumericHeader>,
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <NumericCell>{t('percent', { value: row.original.score })}</NumericCell>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: () => <NumericHeader>{t('records.column_when')}</NumericHeader>,
      enableSorting: false,
      cell: ({ row }) => (
        <NumericCell className="font-normal text-sub">
          {relativeDay(row.original.createdAt)}
        </NumericCell>
      ),
    },
  ];

  return (
    <Panel
      actions={
        <Link
          className={cn(
            'inline-flex h-8 items-center gap-1 rounded-md px-2 text-[12.5px] font-bold text-brand',
            'transition-colors hover:bg-brand/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            isStale && 'pointer-events-none opacity-50',
          )}
          href={`${routes.academy(academySlug)}/learn/records`}
        >
          {t('records.view_all')}
          <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      }
      description={t('records.description')}
      icon={History}
      id="records"
      testId="recent-attempts"
      title={t('records.title')}
      tone="brand"
    >
      {records.length === 0 ? (
        <EmptyState
          body={t('records.empty_body')}
          icon={History}
          title={t('records.empty_title')}
          tone="brand"
        />
      ) : (
        <DataTable
          className="[&_table]:min-w-[620px] [&_tbody_tr]:h-14"
          columns={columns}
          data={records}
          frameless
          // Opening the attempt is the row's whole purpose, so the row is the
          // target rather than a link buried in one cell.
          onRowClick={
            isStale
              ? undefined
              : (record) => {
                  const href = hrefFor(record);
                  if (href) {
                    rememberProgrammaticExerciseNavigation(href);
                    router.push(href);
                  }
                }
          }
          showColumnVisibility={false}
        />
      )}
    </Panel>
  );
}

function NumericHeader({ children }: { children: React.ReactNode }) {
  return <span className="block text-right">{children}</span>;
}

function NumericCell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'block text-right font-mono text-[13px] font-semibold tabular-nums',
        className,
      )}
    >
      {children}
    </span>
  );
}
