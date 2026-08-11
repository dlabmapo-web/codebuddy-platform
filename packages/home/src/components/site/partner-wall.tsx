import { cn } from "@/lib/utils";

/**
 * The partners, in the order the client listed them.
 *
 * The files are the marks from the client's own brief, lifted out of the PDF
 * and trimmed to a common 120px render height so no tile carries more optical
 * weight than another. Several arrive with their background baked in — AI
 * LEADERS and MILITERA on black, 연세대학교 on navy, AIIRC and kakao on
 * yellow — so they are shown in full colour rather than filtered to grey: a
 * grayscale pass does nothing to a black plate and muddies the yellow ones.
 *
 * `src` is optional so a partner can be listed before a usable file exists;
 * the tile then falls back to the name as a wordmark.
 *
 * These are third-party marks. Publishing them is the client's call and their
 * agreements — see §10 of
 * docs/superpowers/specs/2026-08-11-coveedu-marketing-site-design.md.
 */
export type Partner = { name: string; src?: string };

const PARTNERS: Partner[] = [
  { name: "AI LEADERS", src: "/partners/ai-leaders.png" },
  { name: "MILITERA", src: "/partners/militera.png" },
  { name: "디랩코딩학원", src: "/partners/dlab-coding.png" },
  { name: "연세대학교", src: "/partners/yonsei.png" },
  { name: "AIIRC", src: "/partners/aiirc.png" },
  { name: "GigaVis", src: "/partners/gigavis.png" },
  { name: "SAMSUNG", src: "/partners/samsung.png" },
  { name: "kakao", src: "/partners/kakao.png" },
];

function Tile({
  partner,
  duplicate,
}: {
  partner: Partner;
  /** The seamless loop needs a second copy of the track; nobody needs to hear it. */
  duplicate?: boolean;
}) {
  return (
    <li
      aria-hidden={duplicate || undefined}
      className="mx-2 flex w-[248px] shrink-0 items-center justify-center"
    >
      <div
        className={cn(
          "group/tile flex h-[116px] w-full items-center justify-center rounded-[14px] border border-line bg-paper px-5",
          "shadow-card transition-all duration-300",
          "hover:-translate-y-1 hover:border-cove-blue/30 hover:shadow-lift",
          "motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        )}
      >
        {partner.src ? (
          /*
           * A plain <img>: these are small same-origin marks of varying aspect
           * ratio, already trimmed and sized to a common height, and
           * next/image would demand intrinsic dimensions per file to add
           * nothing. `object-contain` keeps each mark's own proportions.
           */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={partner.src}
            alt={partner.name}
            loading="lazy"
            className="max-h-[60px] w-auto max-w-full object-contain opacity-90 transition-opacity duration-300 group-hover/tile:opacity-100"
          />
        ) : (
          <span className="font-display text-center text-[15px] font-semibold tracking-[-0.01em] text-sub">
            {partner.name}
          </span>
        )}
      </div>
    </li>
  );
}

/**
 * A continuous wall rather than a static grid.
 *
 * Eight names in a fixed 4×2 grid read as a short list; the same eight moving
 * read as a roster that continues past the edge of the screen, which is the
 * impression the section is for. The track is duplicated and translated by
 * exactly -50%, so the loop has no seam. It pauses on hover — a wall a reader
 * cannot stop to read is decoration pretending to be evidence — and does not
 * move at all under `prefers-reduced-motion`.
 */
export function PartnerWall() {
  return (
    <div className="cove-marquee-mask relative">
      <ul
        className="cove-marquee"
        style={{ "--marquee-duration": "46s" } as React.CSSProperties}
      >
        {[...PARTNERS, ...PARTNERS].map((partner, index) => (
          <Tile
            key={`${partner.name}-${index}`}
            partner={partner}
            duplicate={index >= PARTNERS.length}
          />
        ))}
      </ul>
    </div>
  );
}
