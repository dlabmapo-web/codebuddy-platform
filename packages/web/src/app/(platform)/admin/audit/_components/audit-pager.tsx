'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';

/**
 * Previous and next, and nothing else.
 *
 * The trail has no numbered pages on purpose: an operator here is either
 * scanning backwards from now or has filtered to something small, and neither
 * is helped by a control that implies page 47 is a place worth going.
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
      className="flex items-center justify-between gap-3"
    >
      <p className="text-[13px] text-sub">
        {t('pager.position', { page, total: lastPage })}
      </p>
      <div className="flex gap-2">
        <PagerLink disabled={page <= 1} href={href(page - 1)}>
          <ChevronLeft className="size-4" />
          {t('pager.previous')}
        </PagerLink>
        <PagerLink disabled={page >= lastPage} href={href(page + 1)}>
          {t('pager.next')}
          <ChevronRight className="size-4" />
        </PagerLink>
      </div>
    </nav>
  );
}

function PagerLink({
  disabled,
  href,
  children,
}: {
  disabled: boolean;
  href: string;
  children: React.ReactNode;
}) {
  const className =
    'inline-flex h-9 items-center gap-1 rounded-lg border border-border bg-card px-3 text-[13.5px] font-bold text-sub transition-colors';
  // A disabled page turn is a span, not a link with a click handler that does
  // nothing: keyboard and screen-reader users should not be able to reach a
  // control that has nowhere to go.
  if (disabled) {
    return (
      <span aria-disabled className={`${className} opacity-40`}>
        {children}
      </span>
    );
  }
  return (
    <Link className={`${className} hover:border-brand hover:text-brand`} href={href}>
      {children}
    </Link>
  );
}
