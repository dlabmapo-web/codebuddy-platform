/**
 * One page's column inside the studio frame: the measure, the heading, and the
 * optional content card.
 *
 * Deliberately synchronous, and deliberately without data access of any kind.
 * It was the other half of `StudioShell`, which awaited the account and so put
 * every page's chrome behind a network read. The chrome moved to the layout
 * (`StudioChrome`); what is left is pure layout, which is what lets a
 * `loading.tsx` render the same shape without being able to fetch anything.
 *
 * Anything added here that awaits puts all ~30 studio pages back behind a
 * blocking read, so nothing here should.
 */
export function StudioPage({
  title,
  description,
  actions,
  back,
  bleed = false,
  showPageHeading = true,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /**
   * The way back out of a detail page, rendered above the heading.
   *
   * A slot rather than something each page puts in its own content, because
   * the content is *below* the title — which is where the two learn detail
   * pages were drawing theirs, leaving a reader looking at a heading with the
   * escape hatch underneath it. Back goes before the thing it backs out of.
   */
  back?: React.ReactNode;
  /** Skip the white content card so a page can lay out its own panels. */
  bleed?: boolean;
  /** Hide the heading when the page owns a live, interactive one. */
  showPageHeading?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-5 py-7">
      {back ? <div className="mb-3">{back}</div> : null}
      {showPageHeading ? (
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[1.7rem] font-extrabold leading-tight">
              {title}
            </h1>
            {description ? (
              <p className="mt-2 max-w-2xl text-[15px] leading-[1.65] text-sub">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? <div className="flex gap-2">{actions}</div> : null}
        </div>
      ) : null}

      {bleed ? (
        children
      ) : (
        <section className="rounded-card border border-border bg-card p-6">
          {children}
        </section>
      )}
    </div>
  );
}
