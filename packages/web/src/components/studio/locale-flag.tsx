import type { Locale } from '@cove/i18n/settings';

import { cn } from '@/lib/utils';

/**
 * The flag beside a language, in the switcher and on its trigger.
 *
 * ## Why these are drawn rather than typed
 *
 * The obvious implementation is the emoji — `🇰🇷`, `🇬🇧` — and it is wrong for
 * this product. Flag emoji are regional-indicator letter pairs, and Windows
 * ships no glyphs for them: every version of Chrome and Edge on Windows renders
 * `🇰🇷` as the bare letters **KR**. A Korean academy's staff on Windows laptops
 * would see two capitals where the flag is supposed to be, next to a label that
 * already says KOR — the control would be worse than it was before the flag was
 * added.
 *
 * Inline SVG renders identically everywhere, costs no request, and scales to
 * whatever the trigger and the menu each want.
 *
 * ## What is simplified
 *
 * Both flags are drawn for a 12-pixel box, and both give up detail that cannot
 * survive it.
 *
 * The Korean flag's four trigrams are solid three-bar groups rather than the
 * broken bars that distinguish geon, ri, gam and gon. At this size those gaps
 * are a fraction of a pixel and render as grey mush; the solid bars keep the
 * corner texture that makes the flag recognisable, which is the entire job.
 *
 * The American flag keeps all thirteen stripes — they are the thing the eye
 * actually reads at a distance — but its fifty stars become twenty-three dots.
 * A five-pointed star at this scale is under half a pixel across and resolves
 * to a smudge; evenly spaced dots read as a star field, which is what the
 * canton is for. Nothing in the product shows either flag large enough for the
 * difference to be visible.
 */
export function LocaleFlag({
  locale,
  className,
}: {
  locale: Locale;
  className?: string;
}) {
  // A 3:2 box, rounded a little so the flag reads as a chip rather than as a
  // raw rectangle butted against the text beside it. The SVG viewport clips its
  // own overflow, which is what keeps the diagonals inside the corners.
  const box = cn('h-3 w-[1.125rem] shrink-0 overflow-hidden rounded-[2px]', className);

  if (locale === 'ko') {
    return (
      <svg aria-hidden className={box} viewBox="0 0 24 16">
        <rect fill="#FFFFFF" height="16" width="24" />
        <circle cx="12" cy="8" fill="#CD2E3A" r="3.6" />
        {/*
          * The taegeuk's lower half. One path rather than two arcs stacked:
          * the S is a small semicircle up, a small semicircle down, then the
          * outer half-circle back, which is the standard construction and the
          * only one that closes cleanly at both edges of the disc.
          */}
        <path
          d="M8.4 8a1.8 1.8 0 0 1 3.6 0 1.8 1.8 0 0 0 3.6 0 3.6 3.6 0 0 1-7.2 0"
          fill="#0047A0"
        />
        <g fill="#0A0A0A">
          <Trigram angle={-57} x={5.2} y={3.6} />
          <Trigram angle={57} x={18.8} y={3.6} />
          <Trigram angle={57} x={5.2} y={12.4} />
          <Trigram angle={-57} x={18.8} y={12.4} />
        </g>
      </svg>
    );
  }

  return (
    <svg aria-hidden className={box} viewBox="0 0 24 16">
      {/* White first, so only the seven red stripes have to be drawn. */}
      <rect fill="#FFFFFF" height="16" width="24" />
      {redStripes.map((y) => (
        <rect fill="#B31942" height={STRIPE} key={y} width="24" y={y} />
      ))}
      {/* The canton covers the top seven stripes, as it does on the real flag. */}
      <rect fill="#0A3161" height={STRIPE * 7} width="9.6" />
      <g fill="#FFFFFF">
        {starRows.map((row) =>
          row.x.map((x) => <circle cx={x} cy={row.y} key={`${x}-${row.y}`} r="0.42" />),
        )}
      </g>
    </svg>
  );
}

/**
 * Thirteen stripes over a 16-unit height, rounded before it reaches the DOM.
 * `16 / 13` is a seventeen-digit float, and every stripe would carry all of it
 * into the markup for a difference no display can resolve.
 */
const STRIPE = Number((16 / 13).toFixed(4));

/** The seven red ones: every other stripe, starting and ending with red. */
const redStripes = [0, 2, 4, 6, 8, 10, 12].map((index) =>
  Number((index * STRIPE).toFixed(4)),
);

/**
 * The canton's dots, in the real flag's alternating five-then-four rhythm.
 *
 * Twenty-three rather than fifty: the offset rows are what the eye reads as a
 * star field, and fifty dots inside a 9.6-unit box would touch each other.
 */
const starRows = [0, 1, 2, 3, 4].map((row) => ({
  y: Number((0.86 + row * 1.723).toFixed(4)),
  x:
    row % 2 === 0
      ? [0.96, 2.88, 4.8, 6.72, 8.64]
      : [1.92, 3.84, 5.76, 7.68],
}));

/**
 * One corner's three bars, perpendicular to the line back to the taegeuk —
 * which is why each corner carries its own angle rather than sharing one.
 */
function Trigram({ angle, x, y }: { angle: number; x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      <rect height="0.62" width="4" x="-2" y="-1.48" />
      <rect height="0.62" width="4" x="-2" y="-0.31" />
      <rect height="0.62" width="4" x="-2" y="0.86" />
    </g>
  );
}
