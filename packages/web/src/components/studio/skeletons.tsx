import { cn } from '@/lib/utils';

/**
 * The shapes a page holds while its first response is in flight.
 *
 * Two rules run through every component here, and both come from
 * docs/superpowers/specs/2026-08-28-loading-states-and-navigation-feedback-design.md.
 *
 * A loading state is a promise about the shape of what is coming: each block
 * reserves the geometry the real content will occupy, so nothing reflows when
 * the data lands.
 *
 * And nothing draws a placeholder for something already known. A table's
 * column headers, a form's field labels, a panel's title, the pagination
 * chrome — all of it is static copy the caller already has, so all of it
 * renders for real. Only the genuinely unknown greys out: cells, figures,
 * names, avatars. That is why `SkeletonTable` and `SkeletonForm` take their
 * labels as required props rather than inventing placeholder widths for them.
 *
 * No file here fetches, and no component takes a hook. These render inside
 * `loading.tsx`, which is a Suspense fallback and therefore has to render
 * synchronously — anything that suspended here would mean no fallback at all.
 */

/* ------------------------------------------------------------------- base */

/**
 * One placeholder field.
 *
 * `.cove-skeleton` carries the sweep, the fade-in delay, and the reduced-motion
 * answer; see the block in `globals.css`. Nothing in this file animates on its
 * own, so every placeholder on a screen stays in phase.
 */
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('cove-skeleton rounded-md', className)}
      data-slot="skeleton"
      {...props}
    />
  );
}

/**
 * The announcement wrapper: one sentence for a whole screenful.
 *
 * A screen reader told nothing about a region of empty divs reports an empty
 * region, which is indistinguishable from a page with no content. One `status`
 * per screen rather than one per block — thirty placeholders each announcing
 * themselves is worse than silence.
 */
export function SkeletonRegion({
  children,
  className,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  /** What is loading, in the reader's language. */
  label: string;
}) {
  return (
    <div aria-busy="true" className={className} data-slot="skeleton-region">
      <span className="sr-only" role="status">
        {label}
      </span>
      {children}
    </div>
  );
}

/* ----------------------------------------------------------------- pieces */

/**
 * Body copy: full-width lines with a short last one, because a paragraph's
 * final line almost never reaches the margin and a stack of equal bars reads
 * as a table instead of prose.
 */
export function SkeletonText({
  className,
  lines = 3,
}: {
  className?: string;
  lines?: number;
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          className={cn('h-3.5', index === lines - 1 && 'w-3/5')}
          key={index}
        />
      ))}
    </div>
  );
}

/** An avatar or a rank marker. */
export function SkeletonCircle({
  className,
  size = 40,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <Skeleton
      className={cn('shrink-0 rounded-full', className)}
      style={{ height: size, width: size }}
    />
  );
}

/**
 * A card with its real heading and a placeholder body.
 *
 * The title is passed rather than greyed out because the page always knows it:
 * a panel is named by the code that places it, not by the response it is
 * waiting for.
 */
export function SkeletonPanel({
  children,
  className,
  height,
  title,
}: {
  children?: React.ReactNode;
  className?: string;
  /** Body height in pixels, matched to what replaces it. */
  height?: number;
  title?: string;
}) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-card border border-border bg-card',
        className,
      )}
    >
      {title ? (
        <header className="border-b border-border px-4 py-3">
          <h2 className="text-[14px] font-bold tracking-[-0.01em]">{title}</h2>
        </header>
      ) : null}
      <div className="p-4" style={height ? { height } : undefined}>
        {children ?? <Skeleton className="h-full min-h-16 w-full" />}
      </div>
    </section>
  );
}

/**
 * A row of stat tiles.
 *
 * The labels are real and the figures are not, which is the honest split: a
 * tile's caption is fixed copy and its number is the thing being fetched.
 */
export function SkeletonMetrics({
  className,
  labels,
}: {
  className?: string;
  labels: string[];
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-3 sm:grid-cols-4',
        className,
      )}
    >
      {labels.map((label) => (
        <div
          className="rounded-card border border-border bg-card p-4"
          key={label}
        >
          <p className="text-[12px] font-bold uppercase tracking-wider text-sub">
            {label}
          </p>
          <Skeleton className="mt-2.5 h-7 w-16" />
        </div>
      ))}
    </div>
  );
}

/**
 * A table with real headers and placeholder cells.
 *
 * The header row, the border treatment, and the footer's pagination chrome
 * mirror `data-table.tsx` exactly, so the swap to real rows moves nothing. The
 * first column is widened on the assumption it carries the name — it does on
 * every directory in the studio, and a uniform grid of equal bars reads as a
 * spreadsheet rather than as a list of people.
 */
export function SkeletonTable({
  className,
  columns,
  rows = 8,
  toolbar = true,
}: {
  className?: string;
  /** The real column headings. */
  columns: string[];
  rows?: number;
  /** Reserve the search and filter row above the table. */
  toolbar?: boolean;
}) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {toolbar ? (
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-10 w-full max-w-64 rounded-lg" />
          <Skeleton className="h-10 w-28 rounded-lg" />
          <Skeleton className="ml-auto h-10 w-24 rounded-lg" />
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-card border border-border bg-card">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border bg-canvas">
              {/* Keyed by position, not by the label. A column heading is
                  caller-supplied text: it can repeat, and a skeleton that does
                  not know which table it is standing in passes blanks — which
                  made every column key the same empty string. Position is the
                  identity here anyway, since these cells never reorder. */}
              {columns.map((column, index) => (
                <th
                  className="whitespace-nowrap px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-sub"
                  key={index}
                  scope="col"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {Array.from({ length: rows }, (_, row) => (
              <tr key={row}>
                {columns.map((column, index) => (
                  <td className="px-4 py-3" key={index}>
                    <Skeleton
                      className={cn('h-4', index === 0 ? 'w-40' : 'w-20')}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Skeleton className="h-8 w-32 rounded-md" />
        <Skeleton className="size-8 rounded-md" />
        <Skeleton className="size-8 rounded-md" />
      </div>
    </div>
  );
}

/**
 * A form: real section headings, real field labels, placeholder inputs.
 *
 * Every string here is copy the page ships, so greying any of it out would be
 * inventing suspense about something already decided.
 */
export function SkeletonForm({
  className,
  sections,
}: {
  className?: string;
  sections: { labels: string[]; title: string }[];
}) {
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {sections.map((section) => (
        <section
          className="rounded-card border border-border bg-card"
          key={section.title}
        >
          <header className="border-b border-border px-6 py-4">
            <h2 className="text-[15px] font-bold tracking-[-0.01em]">
              {section.title}
            </h2>
          </header>
          <div className="grid gap-4 p-6 sm:grid-cols-2">
            {section.labels.map((label) => (
              <div className="flex flex-col gap-1.5" key={label}>
                <span className="text-[13px] font-semibold text-sub">
                  {label}
                </span>
                <Skeleton className="h-10 rounded-lg" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * A grid of cards — a course catalog, a class list.
 *
 * Sized rather than filled: a catalog card's contents vary enough that drawing
 * its internals would be a guess, and a guess that lands wrong reflows.
 */
export function SkeletonCards({
  className,
  count = 6,
  height = 168,
}: {
  className?: string;
  count?: number;
  height?: number;
}) {
  return (
    <div
      className={cn(
        'grid gap-4 sm:grid-cols-2 lg:grid-cols-3',
        className,
      )}
    >
      {Array.from({ length: count }, (_, index) => (
        <Skeleton className="rounded-card" key={index} style={{ height }} />
      ))}
    </div>
  );
}

/**
 * A stacked column of panels, given their heights.
 *
 * The four role overviews are all one column of differently sized panels, and
 * before this they each carried their own copy of this loop.
 */
export function SkeletonColumn({
  className,
  heights,
}: {
  className?: string;
  /** Panel heights in `rem`, top to bottom. */
  heights: number[];
}) {
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {heights.map((height, index) => (
        <Skeleton
          className="rounded-card"
          key={index}
          style={{ height: `${height}rem` }}
        />
      ))}
    </div>
  );
}

/**
 * The studio frame, drawn rather than fetched.
 *
 * Only for cold entry, where the real chrome is itself still rendering — a
 * refresh, or a first arrival from outside the studio. Every navigation *once
 * inside* keeps the real sidebar on screen, because the chrome is a layout and
 * Next does not re-render it; those routes use a content-only skeleton and
 * never this.
 *
 * The rail is `15.5rem` because `SIDEBAR_WIDTH` is, and the bar is `h-14`
 * because the header is. Both are copied deliberately: this has to line up
 * with the thing that replaces it to the pixel, and a shared constant that
 * silently changed one without the other would be worse than the duplication.
 */
export function SkeletonChrome({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div aria-busy="true" className="flex min-h-svh w-full bg-canvas">
      <span className="sr-only" role="status">
        {label}
      </span>

      <div className="hidden w-[15.5rem] shrink-0 flex-col gap-1 border-r border-sidebar-border bg-sidebar p-3 md:flex">
        <Skeleton className="h-11 w-full rounded-lg" />
        <div className="mt-4 flex flex-col gap-1.5">
          {/* Roughly the nav a signed-in reader sees: two groups, and the
              longest is six links. Drawn short rather than long — a rail that
              overshoots leaves a gap when the real nav is briefer. */}
          {[3, 6].map((count, group) => (
            <div className="mb-3 flex flex-col gap-1.5" key={group}>
              <Skeleton className="mb-1 h-3 w-20" />
              {Array.from({ length: count }, (_, index) => (
                <Skeleton className="h-8 w-full rounded-lg" key={index} />
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
          <Skeleton className="size-7 rounded-md" />
          <Skeleton className="h-4 w-36" />
          <div className="ml-auto flex items-center gap-2">
            <Skeleton className="size-9 rounded-lg" />
            <Skeleton className="size-9 rounded-lg" />
            <SkeletonCircle size={32} />
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
