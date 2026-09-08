/**
 * The partners, in the order the client laid them out.
 *
 * The files are the client's own marks, supplied as artwork rather than lifted
 * out of a PDF, trimmed and sized to a common 120px render height so no mark
 * carries more optical weight than another. Every one has an alpha channel and
 * sits directly on the section, with no tile, border, or shadow behind it —
 * the client asked for the marks themselves rather than a row of cards, and a
 * transparent mark on the page's own ground is what a partner wall is.
 *
 * They are shown in full colour rather than filtered to grey: half of these
 * marks are a specific colour before they are anything else, and kakao in
 * grayscale is not kakao.
 *
 * A static 4×2 grid, not a marquee. Eight names is a list a reader can take in
 * at once, and moving it meant they had to wait for the one they were looking
 * for to come back around.
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

export function PartnerWall() {
  return (
    <ul className="grid grid-cols-2 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-4 lg:gap-x-12 lg:gap-y-16">
      {PARTNERS.map((partner) => (
        <li
          key={partner.name}
          className="flex min-h-[72px] items-center justify-center"
        >
          {partner.src ? (
            /*
             * A plain <img>: these are small same-origin marks of varying
             * aspect ratio, already trimmed to a common height, and next/image
             * would demand intrinsic dimensions per file to add nothing.
             * `object-contain` keeps each mark's own proportions.
             */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={partner.src}
              alt={partner.name}
              loading="lazy"
              className="max-h-[52px] w-auto max-w-full object-contain transition-opacity duration-300 hover:opacity-70 motion-reduce:transition-none lg:max-h-[60px]"
            />
          ) : (
            <span className="font-display text-center text-[15px] font-semibold tracking-[-0.01em] text-sub">
              {partner.name}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
