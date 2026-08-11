import Link from "next/link";
import type { ReactNode } from "react";

import { Wave } from "@/components/brand/wave";
import { buttonVariants } from "@/components/ui/button";
import { hues, type Hue } from "@/lib/hues";
import { cn } from "@/lib/utils";
import { Eyebrow, Shell } from "./section";

export type Audience = {
  hue: Hue;
  title: string;
  body: string;
  Icon: (props: { className?: string }) => ReactNode;
  /**
   * Two of the four have a real photograph; the other two carry their icon on
   * the hue gradient. That asymmetry is deliberate — a real room beats an
   * illustration wherever one exists, and the panels stay the same size, the
   * same rail, and the same caption position either way, so the row still
   * reads as one set. Drop a file in `public/photos/` to fill another.
   */
  photo?: string;
};

export type HeroCopy = {
  eyebrow: string;
  titleLead: string;
  titleRest: string;
  lead: string;
  ctaPrimary: string;
  ctaSecondary: string;
  audienceLabel: string;
};

/**
 * The hero is the range, not a headline over a product shot.
 *
 * The one true thing about COVE Edu that nothing else on the page can say is
 * that the same company teaches a child their first `print()` and briefs an
 * auditorium of officers on AI adoption. So the claim is stated, then
 * immediately evidenced by the four rooms it happens in — which is also where
 * the reader learns the hue system the rest of the page runs on.
 */
export function Hero({
  copy,
  audiences,
  studioHref,
  contactHref,
}: {
  copy: HeroCopy;
  audiences: Audience[];
  studioHref: string;
  contactHref: string;
}) {
  return (
    <section className="relative overflow-hidden pt-[72px]">
      {/*
       * The aura: the mark's four blocks at page scale, blurred into the
       * paper. Positions follow the logo — teal upper left, blue upper right,
       * sun far right, coral low centre — so the wash behind the headline is
       * the logo's own arrangement rather than a stock mesh gradient.
       */}
      <div
        aria-hidden="true"
        className="cove-aura pointer-events-none absolute inset-x-0 top-0 h-[760px]"
      />

      <Shell className="relative">
        <div className="grid gap-10 pt-14 pb-12 lg:grid-cols-12 lg:gap-16 lg:pt-24 lg:pb-16">
          <div className="lg:col-span-7">
            <div className="cove-rise">
              <Eyebrow hue="blue">{copy.eyebrow}</Eyebrow>
            </div>
            <h1 className="mt-6 text-[clamp(2.5rem,6vw,4.5rem)] font-extrabold tracking-[-0.035em] text-ink">
              {/*
               * The two lines animate separately, 120ms apart. It is the only
               * choreographed moment on the page and it belongs to the
               * sentence, not to a decorative element.
               */}
              <span className="cove-rise block [animation-delay:80ms]">
                {copy.titleLead}
              </span>
              <span className="cove-rise block [animation-delay:200ms]">
                {copy.titleRest}
              </span>
            </h1>
          </div>

          <div className="flex flex-col justify-end lg:col-span-5">
            <div className="cove-rise [animation-delay:340ms]">
              <p className="max-w-[42ch] text-[17px] leading-[1.8] text-sub">
                {copy.lead}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href={studioHref}
                  className={buttonVariants({ size: "lg" })}
                >
                  {copy.ctaPrimary}
                </Link>
                <Link
                  href={contactHref}
                  className={buttonVariants({ size: "lg", variant: "outline" })}
                >
                  {copy.ctaSecondary}
                </Link>
              </div>
            </div>
          </div>
        </div>

        <p className="font-display cove-rise pb-4 text-[13px] font-semibold uppercase tracking-[0.14em] text-sub [animation-delay:420ms]">
          {copy.audienceLabel}
        </p>
      </Shell>

      <Shell className="relative pb-16 lg:pb-24">
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          {audiences.map((audience, index) => (
            <AudiencePanel
              key={audience.title}
              audience={audience}
              // The four currents arriving, 90ms apart, after the sentence has
              // finished. Left to right, the order the rail keeps everywhere.
              delay={520 + index * 90}
            />
          ))}
        </ul>
      </Shell>
    </section>
  );
}

/*
 * Each panel is its hue falling away to paper, not a flat swatch — the colour
 * is strongest at the rail and gone by the caption, so the label always sits
 * on something near-white and the tile reads as lit rather than filled.
 *
 * Per-hue alphas, not one shared value: the logo hues sit at very different
 * luminances, and a uniform figure would put a clearly visible blue plane next
 * to an almost-invisible teal one.
 */
const panelGradient: Record<Hue, string> = {
  teal: "linear-gradient(180deg, rgb(88 213 195 / 0.30) 0%, rgb(88 213 195 / 0.06) 62%, #fff 100%)",
  blue: "linear-gradient(180deg, rgb(9 94 219 / 0.17) 0%, rgb(9 94 219 / 0.04) 62%, #fff 100%)",
  coral:
    "linear-gradient(180deg, rgb(245 107 97 / 0.24) 0%, rgb(245 107 97 / 0.05) 62%, #fff 100%)",
  sun: "linear-gradient(180deg, rgb(250 197 23 / 0.30) 0%, rgb(250 197 23 / 0.07) 62%, #fff 100%)",
};

function AudiencePanel({
  audience,
  delay,
}: {
  audience: Audience;
  delay: number;
}): ReactNode {
  return (
    <li className="cove-wipe" style={{ animationDelay: `${delay}ms` }}>
      <div
        className={cn(
          "group relative flex h-full min-h-[176px] flex-col overflow-hidden rounded-[14px] p-5 lg:min-h-[252px]",
          "border border-line/70 shadow-card",
          "transition-[transform,box-shadow] duration-300 ease-out",
          "hover:-translate-y-1.5 hover:shadow-lift",
          "motion-reduce:transition-none motion-reduce:hover:translate-y-0",
          audience.photo && "bg-cove-deep",
        )}
        style={
          audience.photo ? undefined : { backgroundImage: panelGradient[audience.hue] }
        }
      >
        {/*
         * The photograph is its own layer rather than a background on the
         * panel, so it can scale on hover while the scrim, the rail, the icon
         * and the caption stay exactly where they are. As a background it
         * would drag the text with it.
         */}
        {audience.photo ? (
          <>
            <span
              aria-hidden="true"
              className="absolute inset-0 bg-cover bg-center transition-transform duration-700 ease-out group-hover:scale-[1.06] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              style={{ backgroundImage: `url(${audience.photo})` }}
            />
            <span
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-cove-deep/90 via-cove-deep/25 to-cove-deep/45"
            />
          </>
        ) : null}

        <span
          className={cn(
            "absolute inset-x-0 top-0 h-[3px]",
            hues[audience.hue].bar,
          )}
          aria-hidden="true"
        />

        {/*
         * The mark's wave, faint, across the lower half — only on the panels
         * without a photograph. Two photo tiles beside two flat gradients read
         * as two finished and two unfinished; the motif gives the flat pair
         * something to look at without pretending to be an image.
         */}
        {audience.photo ? null : (
          <Wave
            tone={audience.hue === "coral" || audience.hue === "sun" ? "warm" : "brand"}
            className="absolute inset-x-0 bottom-0 h-1/2 w-full opacity-70"
          />
        )}

        {/*
         * The icon sits at the top and the caption at the bottom, with the
         * gap between them doing the work — the panel was empty in the middle
         * before, which read as an unfinished slot rather than a designed one.
         */}
        {/*
         * `relative` on both: the photo and scrim above are positioned, and a
         * positioned element paints over static in-flow content regardless of
         * source order. Without it the scrim sits on top of its own caption.
         */}
        <span
          aria-hidden="true"
          className={cn(
            "relative grid size-11 place-items-center rounded-[12px] transition-transform duration-300",
            "group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100",
            audience.photo
              ? "bg-white/15 text-white backdrop-blur-sm"
              : "bg-white/70 " + hues[audience.hue].text,
          )}
        >
          <audience.Icon className="size-5.5" />
        </span>

        <div className="relative mt-auto pt-6">
          <p
            className={cn(
              "text-[16px] font-bold lg:text-[18px]",
              audience.photo ? "text-on-deep" : "text-ink",
            )}
          >
            {audience.title}
          </p>
          <p
            className={cn(
              "mt-1.5 text-[13px] leading-snug lg:text-[14px]",
              audience.photo ? "text-white/75" : "text-sub",
            )}
          >
            {audience.body}
          </p>
        </div>
      </div>
    </li>
  );
}
