import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

/**
 * The way back out of a detail page.
 *
 * One component so the three learn detail pages cannot drift into three
 * shapes, and so the arrow, the hit area, and the focus ring are decided once.
 * It sits in `StudioPage`'s `back` slot, above the heading — a reader looking
 * for the way out looks up, not past the title and into the content.
 *
 * The label names the destination rather than saying "Back": a student who
 * arrived at a course from a class and one who arrived from the catalog are
 * both told where the link actually goes.
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      className="group inline-flex items-center gap-1.5 rounded-lg py-1 pl-1 pr-2.5 text-[13px] font-semibold text-sub transition-colors hover:bg-accent hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      href={href}
    >
      <ArrowLeft
        aria-hidden
        className="size-4 transition-transform group-hover:-translate-x-0.5 motion-reduce:transition-none"
      />
      {label}
    </Link>
  );
}
