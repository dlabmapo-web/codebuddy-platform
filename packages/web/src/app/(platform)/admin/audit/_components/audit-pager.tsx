'use client';

import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';

import { useLayoutTranslation } from '@/i18n';
import { cn } from '@/lib/utils';

/**
 * The trail's page turn, in the shape every table on the console uses.
 *
 * It was Newer/Older as a pair of wide buttons, on the argument that nobody
 * wants page 47. The argument was half right and the shape was wrong: an
 * operator asked "what happened when this academy was set up" wants the *last*
 * page, and had no way to ask for it except by pressing Older forty times.
 *
 * So it is now the four controls `DataTable` uses — first, previous, next,
 * last — reading the same left to right and taking the same
 * `common:pagination` copy. Two page turns on one console should not be two
 * different controls.
 *
 * What stays is the naming. Newer and Older sit under the arrows as the
 * accessible labels, because on a reverse-chronological list "next" is
 * genuinely ambiguous and time is the thing being moved through.
 */
export function AuditPager({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: number;
  total: number;
}) {
  const { t } = useTranslation('platform-audit');
  const { t: common } = useLayoutTranslation('common');
  const searchParams = useSearchParams();
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  if (total <= pageSize) return null;

  const href = (target: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (target <= 1) params.delete('page');
    else params.set('page', String(target));
    const search = params.toString();
    return search ? `/admin/audit?${search}` : '/admin/audit';
  };

  return (
    <nav
      aria-label={t('pager.label')}
      className="flex flex-wrap items-center justify-between gap-3 px-1"
    >
      <p className="text-[13px] text-sub">
        {t('pager.entries', { count: total })}
      </p>
      <div className="flex items-center gap-4">
        <p className="text-[13px] font-semibold">
          {common('pagination.label', { current: page, total: lastPage })}
        </p>
        <div className="flex items-center gap-1">
          <PageLink
            disabled={page <= 1}
            href={href(1)}
            label={common('pagination.first')}
          >
            <ChevronsLeft className="size-4" />
          </PageLink>
          <PageLink
            disabled={page <= 1}
            href={href(page - 1)}
            label={t('pager.previous')}
          >
            <ChevronLeft className="size-4" />
          </PageLink>
          <PageLink
            disabled={page >= lastPage}
            href={href(page + 1)}
            label={t('pager.next')}
          >
            <ChevronRight className="size-4" />
          </PageLink>
          <PageLink
            disabled={page >= lastPage}
            href={href(lastPage)}
            label={common('pagination.last')}
          >
            <ChevronsRight className="size-4" />
          </PageLink>
        </div>
      </div>
    </nav>
  );
}

function PageLink({
  disabled,
  href,
  label,
  children,
}: {
  disabled: boolean;
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  const className =
    'grid size-8 place-items-center rounded-md border border-border bg-card text-sub transition-colors';

  // A disabled page turn is a span, not a link with a click handler that does
  // nothing: keyboard and screen-reader users should not be able to reach a
  // control that has nowhere to go.
  if (disabled) {
    return (
      <span
        aria-disabled
        aria-label={label}
        className={cn(className, 'cursor-not-allowed opacity-35')}
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      aria-label={label}
      className={cn(className, 'hover:border-brand hover:text-brand')}
      href={href}
    >
      {children}
    </Link>
  );
}
