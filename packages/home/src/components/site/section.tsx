import type { ReactNode } from "react";

import { hues, type Hue } from "@/lib/hues";
import { cn } from "@/lib/utils";
import { Reveal } from "./reveal";

/** The page's one horizontal measure. Everything lines up to this. */
export function Shell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-[1200px] px-6 lg:px-10", className)}>
      {children}
    </div>
  );
}

/**
 * A page section.
 *
 * `ground` is the only surface decision available: paper, the cool `mist`, or
 * the deep blue used for the two bands that belong to the product and the
 * footer. Nothing on this site sits on a gradient.
 */
export function Section({
  id,
  ground = "paper",
  className,
  children,
}: {
  id?: string;
  /**
   * No section is plain white any more — flat paper read as unfinished between
   * the coloured bands. Each light ground is one of the mark's hues at the
   * alpha of a whisper, and they alternate so two consecutive sections never
   * share a wash. `warm` belongs to the AI·AX and 창업 side of the business;
   * `teal` to the campus; `cool` to everything the brand blue leads.
   */
  ground?: "paper" | "mist" | "cool" | "teal" | "warm" | "deep";
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn(
        "py-18 md:py-24 lg:py-30",
        // `cove-deep-grad` lights the navy bands from the upper left the way
        // the mark is lit. All of these live in globals.css.
        ground === "mist" && "bg-mist cove-wash",
        ground === "cool" && "cove-ground-cool",
        ground === "teal" && "cove-ground-teal",
        ground === "warm" && "cove-ground-warm",
        ground === "deep" && "bg-cove-deep cove-deep-grad text-on-deep",
        // Anchor nav lands below the sticky header rather than under it.
        id && "scroll-mt-[72px]",
        className,
      )}
    >
      {children}
    </section>
  );
}

/**
 * The eyebrow: a short rule in the section's hue, then the label in the Latin
 * display face. This is the spectrum rail's second appearance — the reader
 * learns the colour on the hero panels and meets it again here.
 */
export function Eyebrow({
  hue,
  children,
  onDeep = false,
}: {
  hue: Hue;
  children: ReactNode;
  onDeep?: boolean;
}) {
  return (
    <p className="flex items-center gap-3">
      <span className={cn("h-0.5 w-7 shrink-0 rounded-full", hues[hue].bar)} />
      <span
        className={cn(
          // `cove-eyebrow` relaxes the tracking under :lang(ko) — the 0.14em
          // here is set for uppercase Latin and is far too loose for Hangul.
          "font-display cove-eyebrow text-[13px] font-semibold uppercase tracking-[0.14em]",
          onDeep ? "text-white/60" : "text-sub",
        )}
      >
        {children}
      </span>
    </p>
  );
}

/**
 * A section header in the staggered grid: the header holds columns 1–5 and the
 * caller's content takes 6–12, so headings step down the left edge instead of
 * every section centring on the same axis.
 */
export function SectionHead({
  hue,
  eyebrow,
  title,
  lead,
  onDeep = false,
  className,
}: {
  hue: Hue;
  eyebrow: string;
  title: string;
  lead?: string;
  onDeep?: boolean;
  className?: string;
}) {
  return (
    <Reveal className={className}>
      <Eyebrow hue={hue} onDeep={onDeep}>
        {eyebrow}
      </Eyebrow>
      <h2
        className={cn(
          // The measure is in `em`, so it tracks the clamp above it. In `ch`
          // or `rem` on the wrapper it would resolve against the wrapper's
          // 16px instead and wrap a 44px Korean heading every six glyphs.
          "mt-5 max-w-[15em] text-[clamp(1.75rem,3.5vw,2.75rem)] font-bold",
          onDeep ? "text-on-deep" : "text-ink",
        )}
      >
        {title}
      </h2>
      {lead ? (
        <p
          className={cn(
            "mt-5 max-w-[46ch] text-[17px] leading-[1.75]",
            onDeep ? "text-white/70" : "text-sub",
          )}
        >
          {lead}
        </p>
      ) : null}
    </Reveal>
  );
}

/** Header left, content right — the site's default two-part section body. */
export function Stagger({
  head,
  children,
}: {
  head: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
      <div className="lg:col-span-5">{head}</div>
      <div className="lg:col-span-7">{children}</div>
    </div>
  );
}
