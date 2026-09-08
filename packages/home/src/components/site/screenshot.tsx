import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * Browser chrome around a product shot. Square-on: no tilt, no perspective, no
 * device mockup. The product is the argument here, and a 3D treatment costs
 * legibility to buy the look of every other SaaS page.
 *
 * `src` takes a real 2x capture. Every slot on the site now passes one, so
 * the mocks this frame used to wrap are gone.
 *
 * The captures come in light and dark pairs, and the slot picks by the surface
 * it sits on rather than by preference: dark on the deep blue band, light on
 * the pale card grounds, and light on the product hero's blue stage so the two
 * pages do not open with the same picture.
 *
 * The chrome stays dark in both cases. It reads as a browser window in dark
 * mode showing a light page, which is what it is.
 */
export function Screenshot({
  src,
  alt,
  children,
  className,
}: {
  src?: string;
  alt: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <figure
      className={cn(
        "overflow-hidden rounded-[12px] border border-white/10 bg-[#0d1117] shadow-[0_24px_60px_-20px_rgba(4,12,32,0.6)]",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <span className="size-2.5 rounded-full bg-white/20" />
        <span className="size-2.5 rounded-full bg-white/20" />
        <span className="size-2.5 rounded-full bg-white/20" />
        <span className="font-display ml-3 truncate rounded-full bg-white/[0.07] px-3 py-1 text-[11px] tracking-wide text-white/40">
          cs.coveedu.com
        </span>
      </div>
      {src ? (
        <Image
          src={src}
          alt={alt}
          width={1600}
          height={1000}
          className="w-full"
          priority
        />
      ) : (
        <div role="img" aria-label={alt}>
          {children}
        </div>
      )}
    </figure>
  );
}
