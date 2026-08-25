import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

import { HeaderControls } from '@/components/studio/header-controls';

/**
 * My Page's own chrome.
 *
 * Not `StudioShell`: that shell is built around one academy and its sidebar,
 * and this page is about the account — which may belong to two academies or to
 * none. Borrowing an academy sidebar here would put a navigation tree for one
 * academy beside a form about all of them.
 */
export function MyPageShell({
  title,
  backHref,
  backLabel,
  children,
}: {
  title: string;
  backHref: string;
  backLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-svh bg-canvas">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-border bg-canvas/85 px-4 backdrop-blur-sm">
        <Link
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-[13.5px] font-semibold text-sub outline-none transition-colors hover:bg-accent hover:text-ink focus-visible:ring-2 focus-visible:ring-brand/40"
          href={backHref}
        >
          <ChevronLeft aria-hidden className="size-4" strokeWidth={2.25} />
          {backLabel}
        </Link>
        <span className="truncate text-[14px] font-semibold text-sub">
          {title}
        </span>
        <HeaderControls className="ml-auto" />
      </header>

      {/* The narrow reading column the design calls for. Sections stack in one
          order on every screen width; nothing reflows into a dashboard grid. */}
      <main className="mx-auto w-full max-w-3xl px-5 pb-16 pt-7">
        {children}
      </main>
    </div>
  );
}
