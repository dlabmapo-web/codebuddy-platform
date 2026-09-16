import type { MemberIdentity } from '@cove/shared';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';
import Link from 'next/link';

import { ProfileAvatar } from '@/components/studio/profile-avatar';
import { courseAccent, courseAccentClasses } from '@/lib/course-accent';
import { cn } from '@/lib/utils';

import type { RankMarker } from '../points/_lib/points-view';
import { toneStyles, type PanelTone } from './overview-ui/panel';
import { StatusBadge } from './people-cells';

/**
 * The shared furniture of the two member pages.
 *
 * ## Colour carries facts here, or it is not used
 *
 * These pages are records, and a record that is merely decorated is harder to
 * read, not easier. So every hue on them is doing a job the reader can name:
 * the hero band takes the tone of what this person *is* — a teacher is `peer`
 * purple wherever the studio draws one, a student is `brand` — a class chip
 * takes its course identity from `courseAccent`, so the same class is the same
 * colour on a teacher's page, on a student's, and on the course card; and a
 * standing takes gold, silver or bronze only when it has actually been won.
 * Nothing is tinted to be lively.
 *
 * ## Why not `SectionCard`
 *
 * The profile surfaces' card is built around a question these pages never ask:
 * every one of its sections wears a chip saying who owns the field — you, the
 * academy, read-only. Here nothing is editable, so that chip would read
 * "read only" on every section of every page, five times over, and a mark that
 * never varies marks nothing.
 */

/* ------------------------------------------------------------------- hero */

/**
 * The person, as the page's one loud element.
 *
 * A tinted band rather than another white card, because the reader arrived
 * from a table of forty identical rows and needs to land somewhere that says
 * "this is the one you picked". The tone is the person's own — their highest
 * role, or brand for a student — so the band is an identification and not a
 * flourish: two teachers look alike, a teacher and a manager do not.
 *
 * `facts` are the identifying handful that used to sit in a section of their
 * own below: an ID, a join date, a student number. They belong against the
 * name, because they are how a reader confirms they opened the right person.
 */
export function MemberHero({
  identity,
  tone,
  eyebrow,
  subtitle,
  chips,
  facts,
  aside,
}: {
  identity: MemberIdentity;
  tone: PanelTone;
  /** What kind of page this is, in one word, above the name. */
  eyebrow: string;
  /** One line under the name: an academy title, a school. */
  subtitle?: React.ReactNode;
  /** Roles, or whatever this kind of member is identified by. */
  chips?: React.ReactNode;
  facts?: React.ReactNode;
  /** The standing board on a student; absent on a teacher. */
  aside?: React.ReactNode;
}) {
  const styles = toneStyles[tone];

  return (
    <section
      className={cn(
        'overflow-hidden rounded-card border border-border bg-card',
        'shadow-[var(--shadow-card)]',
      )}
    >
      <div className={cn(styles.wash)}>
        <div className="flex flex-col gap-6 px-6 py-6 lg:flex-row lg:items-start">
          <div className="flex min-w-0 flex-1 flex-wrap items-start gap-5">
            <ProfileAvatar
              academyImageUrl={identity.avatar.academyImageUrl}
              className="ring-4 ring-card"
              externalAvatarUrl={identity.avatar.externalAvatarUrl}
              globalImageUrl={identity.avatar.globalImageUrl}
              name={identity.displayName}
              size="xl"
            />
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  'text-[11px] font-extrabold uppercase tracking-[0.14em]',
                  styles.text,
                )}
              >
                {eyebrow}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                <h1 className="text-[28px] font-extrabold leading-[1.1] tracking-[-0.03em] text-ink">
                  {identity.displayName}
                </h1>
                <StatusBadge status={identity.status} />
              </div>
              {subtitle ? (
                <p className="mt-1.5 text-[14px] text-sub">{subtitle}</p>
              ) : null}
              {chips ? <div className="mt-3.5">{chips}</div> : null}
              {facts ? (
                <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3 border-t border-border/70 pt-4">
                  {facts}
                </dl>
              ) : null}
            </div>
          </div>
          {aside ? <div className="min-w-0 lg:max-w-[22rem]">{aside}</div> : null}
        </div>
      </div>
    </section>
  );
}

/** One identifying fact in the hero's footer strip. */
export function HeroFact({
  label,
  children,
  empty,
}: {
  label: string;
  children?: React.ReactNode;
  empty: string;
}) {
  const filled = children !== null && children !== undefined && children !== '';
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-sub">
        {label}
      </dt>
      <dd
        className={cn(
          'mt-1 font-mono text-[13.5px] tabular-nums',
          filled ? 'text-ink' : 'text-sub',
        )}
      >
        {filled ? children : empty}
      </dd>
    </div>
  );
}

/* --------------------------------------------------------------- sections */

/**
 * One titled block of facts, marked by what it is about.
 *
 * The icon plate is the section's only colour, and it is the same hue the same
 * subject wears elsewhere in the studio — classes teal, contact details in the
 * role's own tone. A section the reader may not have is not rendered at all;
 * that is enforced by the caller, because the field simply never arrives.
 */
export function DetailSection({
  title,
  description,
  icon: Icon,
  tone = 'brand',
  children,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  tone?: PanelTone;
  children: React.ReactNode;
}) {
  const styles = toneStyles[tone];
  return (
    <section className="overflow-hidden rounded-card border border-border bg-card shadow-[var(--shadow-card)]">
      <header className="flex items-center gap-3 border-b border-border px-5 py-3.5">
        {Icon ? (
          // Solid, not tinted. A pale plate behind a pale glyph reads as a
          // disabled control; at full strength the hue is unmistakably a
          // label for what the section is about.
          <span
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-lg',
              styles.solid,
            )}
          >
            <Icon aria-hidden className="size-[17px]" strokeWidth={2.3} />
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="text-[13px] font-extrabold uppercase tracking-[0.08em] text-ink">
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 text-[12.5px] leading-[1.5] text-sub">
              {description}
            </p>
          ) : null}
        </div>
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

/**
 * The fact list itself.
 *
 * A real `<dl>`, because that is what it is: a screen reader announcing
 * "School, 마포중학교" is reading the relationship the layout draws with two
 * columns. It collapses to one column on a phone rather than squeezing both.
 */
export function FieldList({ children }: { children: React.ReactNode }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-[minmax(6.5rem,auto)_1fr]">
      {children}
    </dl>
  );
}

export function Field({
  label,
  children,
  empty,
}: {
  label: string;
  children?: React.ReactNode;
  /** What to say when there is nothing. Never invented by this component. */
  empty: string;
}) {
  const filled = children !== null && children !== undefined && children !== '';
  return (
    <>
      <dt className="text-[12.5px] font-semibold text-sub sm:py-0.5">{label}</dt>
      <dd
        className={cn(
          'min-w-0 text-[14px] sm:py-0.5',
          filled ? 'text-ink' : 'text-sub',
        )}
      >
        {filled ? children : empty}
      </dd>
    </>
  );
}

/* ---------------------------------------------------------------- classes */

/**
 * The one thing a record card can be clicked into.
 *
 * A square the size of the text beside it, rather than the outlined pill it
 * replaces. A labelled button is right when an action needs explaining; this
 * one does not — it is the only destination a class card has, and its name is
 * already the card's heading — so spelling it out cost a third of the card's
 * width and pushed the facts below the fold on a three-up grid.
 *
 * It wears the brand tint and fills on hover, which is the same thing the
 * rosters' row action does. One appearance for "open this", wherever it is.
 *
 * The label is not dropped, only unspoken: it reaches a screen reader through
 * `aria-label` and a mouse through the tooltip, so nothing is lost but the
 * space.
 */
export function RecordAction({ href, label }: { href: string; label: string }) {
  return (
    <Link
      aria-label={label}
      className="inline-grid size-7 place-items-center rounded-lg bg-brand/10 text-brand transition-colors hover:bg-brand hover:text-on-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      href={href}
      title={label}
    >
      <ArrowUpRight aria-hidden className="size-4" strokeWidth={2.5} />
    </Link>
  );
}

/**
 * A page-level way out of a member's record.
 *
 * The two of them — the points ledger, the manager's editor — are the only
 * places this page sends a reader that a card does not, and they had been
 * plain outlined boxes: the same grey border as the sections around them, on a
 * page whose every other interactive thing had by then been given a colour. A
 * reader scanning for "where can I go from here" had nothing to find.
 *
 * Tinted rather than filled, and that is the distinction worth keeping. A
 * solid button is the page's own verb — save, publish, invite — and nothing on
 * a read-only record is one. These are doors, so they are marked as doors and
 * not as decisions.
 *
 * The tone is the caller's, because the destinations are not alike: the ledger
 * is about points and wears the standing's amber, the editor is a manager's
 * surface and wears theirs.
 */
/**
 * The solid plate each tone fills to on hover, spelled out.
 *
 * Built rather than derived from `toneStyles[tone].solid`, because Tailwind
 * scans source text: a class assembled at runtime by prefixing `hover:` would
 * compile to nothing and the control would only ever change shade.
 */
const detailLinkHover: Record<PanelTone, string> = {
  primary: 'hover:bg-primary hover:text-on-primary',
  brand: 'hover:bg-brand hover:text-on-brand',
  peer: 'hover:bg-peer hover:text-on-peer',
  success: 'hover:bg-success hover:text-on-success',
  teal: 'hover:bg-teal hover:text-on-teal',
  warning: 'hover:bg-warning hover:text-on-warning',
  danger: 'hover:bg-danger hover:text-on-danger',
  draft: 'hover:bg-draft hover:text-on-draft',
};

export function DetailLink({
  href,
  icon: Icon,
  label,
  tone = 'brand',
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  tone?: PanelTone;
}) {
  const styles = toneStyles[tone];
  return (
    <Link
      className={cn(
        'inline-flex items-center gap-2 rounded-lg px-3.5 py-2.5',
        'text-[13px] font-bold transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        styles.chip,
        detailLinkHover[tone],
      )}
      href={href}
    >
      <Icon aria-hidden className="size-4" strokeWidth={2.4} />
      {label}
      <ArrowUpRight aria-hidden className="size-3.5 opacity-70" />
    </Link>
  );
}

/**
 * A class or a course as a record row.
 *
 * Four registers, and the split is what stops the row becoming a paragraph.
 *
 * The **mark** is a solid tile carrying the subject's icon, in the hue
 * `courseAccent` derives from its id — the same hue that class or course wears
 * on its own card, in the learning surfaces, and in the chips below. It is
 * doing two jobs at once: saying what kind of thing this row is, and giving a
 * reader scanning three cards across something to match against without
 * reading a name twice.
 *
 * The **name** is what the reader came for. The **facts** are the two or three
 * numbers that make it mean something, set in the mono face the rest of the
 * studio uses for data so they read as measurements rather than as more words.
 * The **chips** are what this row is attached to: the courses a class teaches,
 * the classes a course is taught in.
 *
 * Facts are label-and-value pairs rather than a pre-built string, so a locale
 * can put the number where its grammar wants it. Their icons stay quiet — the
 * tile is where this card spends its colour, and a second coloured glyph per
 * number would be decoration competing with it.
 */
export function RecordRow({
  accentId,
  icon: Icon,
  name,
  meta,
  facts,
  chips,
  action,
}: {
  /** What the hue is derived from — the class's or the course's own id. */
  accentId: string;
  icon: LucideIcon;
  name: string;
  /** One line under the name: who teaches it, where it sits. */
  meta?: React.ReactNode;
  facts?: readonly {
    label: string;
    value: string;
    icon?: LucideIcon;
  }[];
  chips?: readonly { id: string; label: string }[];
  action?: React.ReactNode;
}) {
  const accent = courseAccentClasses[courseAccent(accentId)];

  return (
    // `h-full` so cards in one row end level: the grid stretches them, and a
    // card that stopped at its own content left the shortest one floating
    // against the tallest.
    <li className="flex h-full flex-col rounded-lg border border-border px-4 py-3.5">
      {/* The action is a sibling of the text column, not inside it. Nested and
          wrapping, it sat beside short names and dropped to a second line
          under long ones — so the same button landed at a different height in
          every card of a row, which is the one thing a row of cards must not
          do. Out here it is pinned to the top right whatever the name does. */}
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg',
            accent.mark,
          )}
        >
          <Icon aria-hidden className="size-[18px]" strokeWidth={2.3} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-bold leading-snug text-ink">{name}</p>
          {meta ? (
            <p className="mt-0.5 text-[12.5px] text-sub">{meta}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>

      {facts && facts.length > 0 ? (
        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
          {facts.map((fact) => {
            const FactIcon = fact.icon;
            return (
              <div className="flex items-center gap-1.5" key={fact.label}>
                {FactIcon ? (
                  <FactIcon aria-hidden className="size-3.5 text-sub" />
                ) : null}
                <dt className="text-[11.5px] font-semibold text-sub">
                  {fact.label}
                </dt>
                <dd className="font-mono text-[13px] font-bold tabular-nums text-ink">
                  {fact.value}
                </dd>
              </div>
            );
          })}
        </dl>
      ) : null}

      {/* `mt-auto` settles the chips at the foot of the card, so the rows of
          them line up across a grid whose cards hold different amounts. */}
      {chips && chips.length > 0 ? (
        <div className="mt-auto flex flex-wrap gap-1.5 pt-2.5">
          {chips.map((chip) => {
            const chipAccent = courseAccentClasses[courseAccent(chip.id)];
            return (
              <span
                className={cn(
                  'inline-flex rounded-md px-2 py-0.5 text-[12px] font-bold',
                  chipAccent.tint,
                )}
                key={chip.id}
              >
                {chip.label}
              </span>
            );
          })}
        </div>
      ) : null}
    </li>
  );
}

/* --------------------------------------------------------------- standing */

/**
 * One class's standing, coloured by what was actually won.
 *
 * The page's one bold element, and the argument for it is that the colour is
 * information: gold, silver and bronze appear on first, second and third and
 * nowhere else, so a reader sweeping five classes sees where this child leads
 * before reading a single number. The medal vocabulary is `rankMarker`'s,
 * already used on the points surfaces, so a crown here and a crown there mean
 * the same thing.
 *
 * The hue is carried by the rank chip and the number itself, on a plain card.
 * A filled card per medal turned a board of five into a wall of yellow, and a
 * coloured spine down the edge of every one of them was a second mark for a
 * fact the chip had already made.
 *
 * The class name wraps and is never truncated. Two classes called "Playwright
 * Class 1788146770871" and "Playwright Class 1788828157724" are told apart by
 * their last digits, and a card that cut them at "Playwright Class …" left the
 * reader with two identical labels and no way to tell which standing was
 * which.
 *
 * A student with no position gets no medal and no colour, because they have
 * not been placed — a different fact from placing last.
 */
export function StandingCard({
  className,
  points,
  pointsLabel,
  position,
  positionLabel,
  marker,
}: {
  className: string;
  points: string;
  pointsLabel: string;
  position?: string;
  positionLabel: string;
  marker: RankMarker;
}) {
  const medal = marker.kind === 'medal' ? marker : null;
  const Icon = medal?.icon;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-[13px] font-bold leading-snug text-ink">
            {className}
          </p>
          {position ? (
            <span
              className={cn(
                'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[12px] font-bold tabular-nums',
                medal ? medal.chip : 'bg-muted text-sub',
              )}
            >
              {Icon ? <Icon aria-hidden className="size-3.5" /> : null}
              {position}
            </span>
          ) : (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11.5px] font-semibold text-sub">
              {positionLabel}
            </span>
          )}
        </div>
        <p className="flex items-baseline gap-1.5">
          <span
            className={cn(
              'font-mono text-[26px] font-bold leading-none tabular-nums',
              medal ? medal.text : 'text-ink',
            )}
          >
            {points}
          </span>
          <span className="text-[11.5px] font-semibold text-sub">
            {pointsLabel}
          </span>
        </p>
      </div>
    </div>
  );
}

/**
 * A number worth reading across the room, with its name underneath.
 *
 * The quiet counterpart to `StandingCard`: used for measurements nobody wins,
 * so it carries no colour at all.
 */
export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-[7rem] rounded-lg border border-border bg-muted/40 px-4 py-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-sub">
        {label}
      </p>
      <p className="mt-1.5 font-mono text-[20px] font-bold leading-none tabular-nums text-ink">
        {value}
      </p>
      {hint ? <p className="mt-1.5 text-[12px] text-sub">{hint}</p> : null}
    </div>
  );
}

/* ----------------------------------------------------------------- footer */

/** The one action either page offers, set apart from the record itself. */
export function DetailActions({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-2 pt-1">{children}</div>;
}
