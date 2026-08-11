import type { ReactNode } from "react";

import { hues, type Hue } from "@/lib/hues";
import { cn } from "@/lib/utils";

/*
 * The hue bloom that fades in behind a card on hover. Written out per hue
 * because Tailwind cannot see an interpolated class name, and as an inline
 * gradient because there is no utility for a positioned radial.
 */
const glow: Record<Hue, string> = {
  teal: "radial-gradient(70% 60% at 100% 0%, rgb(88 213 195 / 0.16), transparent 70%)",
  blue: "radial-gradient(70% 60% at 100% 0%, rgb(9 94 219 / 0.12), transparent 70%)",
  coral:
    "radial-gradient(70% 60% at 100% 0%, rgb(245 107 97 / 0.14), transparent 70%)",
  sun: "radial-gradient(70% 60% at 100% 0%, rgb(250 197 23 / 0.18), transparent 70%)",
};

/**
 * A raised panel that lights up in its section's colour.
 *
 * The gradient border and the lift live in `.cove-card` in globals.css; this
 * adds the per-hue bloom and keeps the content above it.
 */
export function Card({
  hue,
  className,
  children,
}: {
  hue: Hue;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("cove-card group h-full overflow-hidden", className)}>
      <span
        aria-hidden="true"
        className="cove-card__glow"
        style={{ backgroundImage: glow[hue] }}
      />
      <div className="relative flex h-full flex-col">{children}</div>
    </div>
  );
}

/**
 * The icon plate.
 *
 * The same shape the product uses on its course and class cards — a rounded
 * tile of the hue at low alpha with the icon in the hue's ink weight (see
 * `learn/_components/course-card.tsx` in `@cove/web`). Carrying it over is what
 * makes a visitor who signs in feel they are still in the same product.
 *
 * It scales slightly when the card under it is hovered, which is why the card
 * sets `group`.
 */
export function IconPlate({
  hue,
  children,
  className,
}: {
  hue: Hue;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-12 shrink-0 place-items-center rounded-[12px] transition-transform duration-300",
        "group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100",
        hues[hue].plate,
        className,
      )}
    >
      {children}
    </span>
  );
}
