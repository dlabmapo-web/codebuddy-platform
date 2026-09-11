'use client';

import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';

import { EmptyState, Panel } from './overview-ui/panel';

/**
 * The frame the Students and Staff rosters share with the Members page: the
 * failure panel, the empty state, the "1–25 of 312" line, and the row's
 * profile link. Pulled out so the three read as one family of pages rather
 * than three that happen to look alike until one of them is changed.
 */

/**
 * A read that failed with nothing yet on screen, and a way to try again.
 *
 * An empty roster and an unreachable one must not look alike: one is a fact
 * about the academy, the other is a fact about the network.
 */
export function RosterFailure({
  message,
  onRetry,
  retryLabel,
  title,
}: {
  message: string;
  onRetry: () => void;
  retryLabel: string;
  title: string;
}) {
  return (
    <Panel title={title} tone="danger">
      <div className="p-4">
        <p className="text-[13px] text-danger">{message}</p>
        <button
          className="mt-3 inline-flex h-9 items-center rounded-lg bg-danger px-3.5 text-[13px] font-bold text-on-danger transition-opacity hover:opacity-90"
          onClick={onRetry}
          type="button"
        >
          {retryLabel}
        </button>
      </div>
    </Panel>
  );
}

/** Below the table: the empty state when there are no rows, the range when there are. */
export function RosterFooter({
  emptyBody,
  emptyIcon,
  emptyTitle,
  page,
  rowCount,
  showingLabel,
  title,
}: {
  emptyBody: string;
  emptyIcon: LucideIcon;
  emptyTitle: string;
  page: { page: number; pageSize: number } | null;
  rowCount: number;
  showingLabel: (from: number, to: number) => string;
  title: string;
}) {
  if (rowCount === 0 || !page) {
    return (
      <Panel title={title} tone="brand">
        <EmptyState
          body={emptyBody}
          icon={emptyIcon}
          title={emptyTitle}
          tone="brand"
        />
      </Panel>
    );
  }
  const from = (page.page - 1) * page.pageSize + 1;
  return (
    <p className="text-[12px] text-sub">
      {showingLabel(from, from + rowCount - 1)}
    </p>
  );
}

/** The row's way into the member profile, as one labelled glyph. */
export function ProfileLinkCell({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <div className="flex justify-end">
      <Link
        aria-label={label}
        className="grid size-8 place-items-center rounded-md text-sub transition-colors hover:bg-accent hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        href={href}
        title={label}
      >
        <Icon className="size-4" />
      </Link>
    </div>
  );
}
