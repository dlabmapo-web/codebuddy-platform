'use client';

/**
 * A count on a nav row: how many people are waiting on the reader.
 *
 * ## Why it is amber and not red
 *
 * It wears `draft` — the same amber the PENDING chip wears in the applications
 * table and on the applicant's own pending screen. One state, one colour,
 * wherever it is drawn: a manager who learns that amber means "waiting to be
 * reviewed" on the page should not meet a different colour for the same fact
 * in the nav. Red is reserved for something failing, and an applicant who
 * signed up eleven minutes ago is not a failure.
 *
 * ## Why it is a filled swatch and not a soft one
 *
 * The soft variant this started as — amber text on `draft-soft` — is the right
 * weight for a chip sitting *inside* a table, where the reader is already
 * looking at the row. In the nav it has the opposite job: it has to be found
 * without being looked for, by someone whose eyes are on the page content and
 * who has no reason to suspect anyone is waiting.
 *
 * So it takes the solid fill, which is what every other "this is a state, not
 * a decoration" mark in the product does. `on-draft` exists for the same
 * reason its siblings do: dark mode lightens the amber rather than darkening
 * it, so the label has to flip with it — white on `#A45A08` is 5.1:1, and
 * near-black on `#E0A34A` is 8.7:1, where one fixed label colour would fail
 * one of the two themes.
 *
 * ## Why zero draws nothing
 *
 * A badge showing `0` is a badge that is always there, and a badge that is
 * always there stops being read. The empty state of this control is its
 * absence — which is also what makes its appearance information.
 *
 * ## Why it caps at 99
 *
 * Not to protect the layout from four digits so much as to keep the row's
 * text from being pushed into a truncation by a number nobody reads
 * precisely. Past a hundred the answer is "a lot", and `99+` says that in the
 * width of the label it must not steal.
 */
export function NavCountBadge({
  count,
  label,
}: {
  count: number;
  /** The sentence a screen reader hears in place of a bare number. */
  label: string;
}) {
  if (count <= 0) return null;

  return (
    <span
      className="ml-auto inline-flex h-5 min-w-5 shrink-0 select-none items-center justify-center rounded-full bg-draft px-1.5 text-[11px] font-bold leading-none tabular-nums text-on-draft"
      // The digits are decoration for anyone not reading the screen; the
      // label below is the fact. Without this a screen reader announces
      // "Applications 3", which is a number attached to nothing.
      role="status"
    >
      <span aria-hidden>{count > 99 ? '99+' : count}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * The same fact when the rail is collapsed to icons, where a number does not
 * fit beside a glyph.
 *
 * A dot rather than a shrunken pill: at this size digits are unreadable, and a
 * two-character pill crowding a 20px icon reads as part of the icon. The
 * tooltip the button already shows carries the number, so nothing is lost —
 * the dot's job is only to say "there is something here", which is exactly
 * what a collapsed rail can usefully communicate.
 *
 * Positioned against the menu item, which is `relative`, and
 * `pointer-events-none` so it can never eat the click meant for the link
 * underneath it.
 */
export function NavCountDot({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;

  return (
    <span
      aria-label={label}
      className="pointer-events-none absolute right-1.5 top-1.5 size-2 rounded-full bg-draft ring-2 ring-sidebar"
      role="status"
    />
  );
}
