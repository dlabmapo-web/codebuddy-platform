/**
 * The partners, travelling.
 *
 * The files are the client's own marks, supplied as artwork rather than lifted
 * out of a PDF, and trimmed to a common 120px render height so no mark carries
 * more optical weight than another. Every one has an alpha channel and rides
 * directly on the section — no tile, no border, no shadow. The two things this
 * section has been through are worth stating so neither is undone by accident:
 * the marks used to sit in white cards, which read as rectangles sliding past
 * rather than logos, and the motion was once removed altogether, which turned a
 * roster into a short list. It is bare marks, moving.
 *
 * They are shown in full colour rather than filtered to grey: half of these
 * marks are a specific colour before they are anything else, and kakao in
 * grayscale is not kakao.
 *
 * `src` is optional so a partner can be listed before a usable file exists;
 * the entry then falls back to the name as a wordmark.
 *
 * These are third-party marks. Publishing them is the client's call and their
 * agreements — see §10 of
 * docs/superpowers/specs/2026-08-11-coveedu-marketing-site-design.md.
 */
export type Partner = { name: string; src?: string };

const PARTNERS: Partner[] = [
  { name: "AI LEADERS", src: "/partners/ai-leaders.png" },
  { name: "GigaVis", src: "/partners/gigavis.png" },
  { name: "디랩코딩학원", src: "/partners/dlab-coding.png" },
  { name: "AIIRC", src: "/partners/aiirc.png" },
  { name: "MILITERA", src: "/partners/militera.png" },
  { name: "SAMSUNG", src: "/partners/samsung.png" },
  { name: "연세대학교", src: "/partners/yonsei.png" },
  { name: "kakao", src: "/partners/kakao.png" },
];

function Mark({
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
      className="flex w-[200px] shrink-0 items-center justify-center px-6 lg:w-[248px] lg:px-8"
    >
      {partner.src ? (
        /*
         * A plain <img>: these are small same-origin marks of varying aspect
         * ratio, already trimmed to a common height, and next/image would
         * demand intrinsic dimensions per file to add nothing. `object-contain`
         * keeps each mark's own proportions.
         */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={partner.src}
          alt={duplicate ? "" : partner.name}
          loading="lazy"
          className="max-h-[46px] w-auto max-w-full object-contain lg:max-h-[54px]"
        />
      ) : (
        <span className="font-display text-center text-[15px] font-semibold tracking-[-0.01em] text-sub">
          {partner.name}
        </span>
      )}
    </li>
  );
}

/**
 * A continuous wall rather than a static row.
 *
 * Eight names standing still read as a short list; the same eight moving read
 * as a roster that continues past the edge of the screen, which is the
 * impression the section is for. The track is duplicated and translated by
 * exactly -50%, so the loop has no seam. It pauses on hover and on keyboard
 * focus, and does not move at all under `prefers-reduced-motion`, where the
 * doubled track wraps into a centred grid instead.
 */
export function PartnerWall() {
  return (
    <div className="cove-marquee-mask relative">
      <ul
        className="cove-marquee"
        style={{ "--marquee-duration": "46s" } as React.CSSProperties}
      >
        {[...PARTNERS, ...PARTNERS].map((partner, index) => (
          <Mark
            key={`${partner.name}-${index}`}
            partner={partner}
            duplicate={index >= PARTNERS.length}
          />
        ))}
      </ul>
    </div>
  );
}
