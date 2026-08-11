import Link from "next/link";

import { Reveal } from "@/components/site/reveal";
import { Eyebrow, Shell } from "@/components/site/section";
import { buttonVariants } from "@/components/ui/button";
import { ArrowRight, Phone } from "@/components/ui/icons";
import type { ProductT } from "@/i18n/types";
import { cn } from "@/lib/utils";

/**
 * The closing ask, on full brand blue.
 *
 * This band used to share the footer's navy, so the page ended in one
 * undifferentiated dark mass with a rule through it. The product's own blue
 * separates the two planes and puts the loudest colour on the page exactly
 * where the reader is being asked to act.
 */
export function Close({ t, eyebrow }: { t: ProductT; eyebrow: string }) {
  const phone = t("close.phone");

  return (
    <section className="cove-studio-cta py-18 text-on-deep md:py-24 lg:py-28">
      <Shell>
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-6">
            <Reveal>
              <Eyebrow hue="sun" onDeep>
                {eyebrow}
              </Eyebrow>
              <h2 className="mt-5 text-[clamp(1.75rem,3.5vw,2.75rem)] font-bold text-on-deep">
                {t("close.title")}
              </h2>
              <p className="mt-5 max-w-[46ch] text-[17px] leading-[1.75] text-white/80">
                {t("close.lead")}
              </p>
            </Reveal>
          </div>

          <div className="flex flex-col justify-center lg:col-span-6">
            <Reveal delay={100}>
              <div className="rounded-[16px] border border-white/20 bg-white/10 p-7 backdrop-blur-sm">
                <p className="font-display cove-eyebrow text-[12px] font-semibold uppercase tracking-[0.14em] text-white/65">
                  {t("close.phone_label")}
                </p>
                <a
                  href={`tel:${phone.replace(/[^\d+]/g, "")}`}
                  className="font-display tabular mt-3 flex items-center gap-3 text-[clamp(1.75rem,4vw,2.5rem)] font-bold tracking-[-0.02em] text-on-deep transition-colors hover:text-cove-sun"
                >
                  <Phone className="size-6 shrink-0 text-cove-sun" />
                  {phone}
                </a>
                <Link
                  href="/"
                  className={cn(
                    buttonVariants({ variant: "onDeepSolid" }),
                    "mt-7",
                  )}
                >
                  {t("close.cta")}
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </Reveal>
          </div>
        </div>
      </Shell>
    </section>
  );
}
