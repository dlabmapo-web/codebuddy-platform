import Link from "next/link";

import { Screenshot, StudentMock } from "@/components/site/screenshot";
import { Shell } from "@/components/site/section";
import { buttonVariants } from "@/components/ui/button";
import { ArrowLeft } from "@/components/ui/icons";
import type { ProductT } from "@/i18n/types";

/**
 * The product hero, on Cove Studio's own blue.
 *
 * Bright rather than the company page's navy: the platform is a light product
 * and a near-black opening promised something it does not look like. The
 * screenshot sits square-on beside the claim — the product is the argument
 * here, and a tilt costs legibility to buy the look of every other SaaS page.
 */
export function StudioHero({
  t,
  appUrl,
}: {
  t: ProductT;
  appUrl: string;
}) {
  return (
    <section className="cove-studio-grad pt-[72px] text-on-deep">
      <Shell>
        <div className="grid gap-12 py-16 lg:grid-cols-12 lg:gap-16 lg:py-24">
          <div className="lg:col-span-6">
            <Link
              href="/"
              className="font-display cove-eyebrow inline-flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-white/70 transition-colors hover:text-white"
            >
              <ArrowLeft className="size-3.5" />
              {t("hero.back")}
            </Link>
            <h1 className="cove-rise mt-8 text-[clamp(2.25rem,5vw,3.75rem)] font-extrabold tracking-[-0.035em] text-on-deep">
              {t("hero.title")}
            </h1>
            <p className="cove-rise mt-7 max-w-[46ch] text-[17px] leading-[1.8] text-white/85 [animation-delay:140ms]">
              {t("hero.lead")}
            </p>
            <div className="cove-rise mt-9 flex flex-wrap gap-3 [animation-delay:240ms]">
              <Link
                href="/#contact"
                className={buttonVariants({
                  variant: "onDeepSolid",
                  size: "lg",
                })}
              >
                {t("hero.cta_primary")}
              </Link>
              <a
                href={appUrl}
                className={buttonVariants({
                  variant: "onDeepOutline",
                  size: "lg",
                })}
              >
                {t("hero.cta_secondary")}
              </a>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="cove-rise [animation-delay:180ms]">
              <Screenshot alt={t("student.shot_alt")}>
                <StudentMock />
              </Screenshot>
            </div>
          </div>
        </div>
      </Shell>
    </section>
  );
}
