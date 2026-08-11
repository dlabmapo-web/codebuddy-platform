import { cn } from "@/lib/utils";

/**
 * The mark's wave, drawn large.
 *
 * It fills the panels that are waiting on photography. A tinted empty
 * rectangle reads as a missing asset; the brand's own motif at scale reads as
 * a designed panel, and it stays worth looking at if a photo never arrives.
 *
 * Purely decorative — the caller labels the panel.
 */
export function Wave({
  className,
  tone = "brand",
}: {
  className?: string;
  tone?: "brand" | "warm" | "onDeep";
}) {
  const stops =
    tone === "warm"
      ? ["#F56B61", "#FAC517"]
      : tone === "onDeep"
        ? ["#58D5C3", "#86BBF1"]
        : ["#095EDB", "#58D5C3"];

  return (
    <svg
      viewBox="0 0 400 200"
      fill="none"
      preserveAspectRatio="xMidYMid slice"
      className={cn("pointer-events-none", className)}
      aria-hidden="true"
    >
      {/*
       * Six copies of the mark's crest, each a little wider and fainter than
       * the one before — the single wave in the logo, opened out into water.
       */}
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <path
          key={index}
          d={`M-40 ${118 + index * 15} c 34 -${30 + index * 3} 68 -${30 + index * 3} 102 0 s 68 ${30 + index * 3} 102 0 s 68 -${30 + index * 3} 102 0 s 68 ${30 + index * 3} 102 0`}
          stroke={index % 2 === 0 ? stops[0] : stops[1]}
          strokeWidth={2.5}
          strokeLinecap="round"
          // Kept faint on purpose. This panel is standing in for a photograph,
          // and a motif loud enough to compete with one would have to be
          // turned down again the day the photograph arrives.
          opacity={0.32 - index * 0.045}
        />
      ))}
    </svg>
  );
}
