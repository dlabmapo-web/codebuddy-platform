import Link from "next/link";

import { Reveal } from "@/components/site/reveal";
import { Screenshot, StudentMock } from "@/components/site/screenshot";
import { Section, SectionHead, Shell } from "@/components/site/section";
import { buttonVariants } from "@/components/ui/button";
import {
  ArrowRight,
  ChartBar,
  CircleCheck,
  Eye,
  Zap,
} from "@/components/ui/icons";
import type { MarketingT } from "@/i18n/types";
import { cn } from "@/lib/utils";

/** The Cove Studio band on the company page — the product, previewed. */
export function StudioPreview({ t }: { t: MarketingT }) {
  const points = [
    {
      Icon: Zap,
      title: t("studio.point_run_title"),
      body: t("studio.point_run_body"),
    },
    {
      Icon: CircleCheck,
      title: t("studio.point_grade_title"),
      body: t("studio.point_grade_body"),
    },
    {
      Icon: Eye,
      title: t("studio.point_live_title"),
      body: t("studio.point_live_body"),
    },
    {
      Icon: ChartBar,
      title: t("studio.point_data_title"),
      body: t("studio.point_data_body"),
    },
  ];

  return (
    <Section id="studio" ground="deep">
      <Shell>
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <SectionHead
              hue="teal"
              onDeep
              eyebrow={t("studio.eyebrow")}
              title={t("studio.title")}
              lead={t("studio.lead")}
            />
            <Reveal delay={120}>
              <Link
                href="/cove-studio"
                className={cn(
                  buttonVariants({ variant: "onDeepSolid", size: "lg" }),
                  "mt-9",
                )}
              >
                {t("studio.cta")}
                <ArrowRight className="size-4" />
              </Link>
            </Reveal>
          </div>

          <div className="lg:col-span-7">
            <Reveal delay={80}>
              <Screenshot alt={t("studio.screenshot_alt")}>
                <StudentMock />
              </Screenshot>
            </Reveal>
          </div>
        </div>

        {/*
         * Glass tiles rather than a bare four-column list: on the deep band a
         * plain text grid disappears into the plane, and a faint white fill
         * with a hairline gives each claim its own footprint without adding a
         * second colour to the section.
         */}
        <ul className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {points.map((point, index) => (
            <Reveal as="li" key={point.title} delay={index * 80}>
              <div className="group h-full rounded-[14px] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-cove-teal/40 hover:bg-white/[0.07] motion-reduce:transition-none motion-reduce:hover:translate-y-0">
                <span
                  aria-hidden="true"
                  className="grid size-11 place-items-center rounded-[12px] bg-cove-teal/15 text-cove-teal transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                >
                  <point.Icon className="size-5.5" />
                </span>
                <h3 className="mt-5 text-[16px] font-bold text-on-deep">
                  {point.title}
                </h3>
                <p className="mt-2.5 text-[14px] leading-[1.7] text-white/60">
                  {point.body}
                </p>
              </div>
            </Reveal>
          ))}
        </ul>
      </Shell>
    </Section>
  );
}
