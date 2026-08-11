/**
 * The spectrum rail.
 *
 * The four hues come off the logo's blocks and are used as a *system*: one hue
 * per part of the business, carried from the hero's audience panels through
 * every section eyebrow to the footer's top edge. It is the only ornamental
 * device on the site, and it encodes which part of the company you are reading
 * rather than decorating the page.
 *
 * `bar` is the logo value and is for fills only. `text` is the darkened `-ink`
 * counterpart, because three of the four logo hues sit between 1.6:1 and 2.9:1
 * on white and cannot legally carry a glyph there — see the note in
 * globals.css. On the deep bands use `bar`'s colour for text instead; it has
 * plenty of contrast against navy.
 *
 * Written out as whole class strings because Tailwind scans source statically
 * and would never see `bg-cove-${hue}`.
 */
export const hues = {
  teal: {
    bar: "bg-cove-teal",
    text: "text-cove-teal-ink",
    plate: "bg-cove-teal/15 text-cove-teal-ink",
  },
  blue: {
    bar: "bg-cove-blue",
    text: "text-cove-blue",
    plate: "bg-cove-blue/10 text-cove-blue",
  },
  coral: {
    bar: "bg-cove-coral",
    text: "text-cove-coral-ink",
    plate: "bg-cove-coral/14 text-cove-coral-ink",
  },
  sun: {
    bar: "bg-cove-sun",
    text: "text-cove-sun-ink",
    plate: "bg-cove-sun/18 text-cove-sun-ink",
  },
} as const;

export type Hue = keyof typeof hues;

/** The rail's canonical order — hero panels, footer bar, anywhere all four appear. */
export const hueOrder = ["teal", "blue", "coral", "sun"] as const;
