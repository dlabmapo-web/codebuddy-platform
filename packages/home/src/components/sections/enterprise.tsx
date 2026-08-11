import Image from "next/image";

import { Reveal } from "@/components/site/reveal";
import { Section, SectionHead, Shell } from "@/components/site/section";
import { Card } from "@/components/ui/card";
import { Clock, Sparkles, TrendingUp } from "@/components/ui/icons";
import type { MarketingT } from "@/i18n/types";

/** 기업·대학·공공기관 AI 교육 — the AI·AX side of the business. */
export function Enterprise({ t }: { t: MarketingT }) {
  const outcomes = [
    {
      Icon: Sparkles,
      title: t("enterprise.outcome_1_title"),
      body: t("enterprise.outcome_1_body"),
    },
    {
      Icon: Clock,
      title: t("enterprise.outcome_2_title"),
      body: t("enterprise.outcome_2_body"),
    },
    {
      Icon: TrendingUp,
      title: t("enterprise.outcome_3_title"),
      body: t("enterprise.outcome_3_body"),
    },
  ];

  return (
    <Section id="training" ground="mist">
      <Shell>
        <SectionHead
          hue="coral"
          eyebrow={t("enterprise.eyebrow")}
          title={t("enterprise.title")}
          lead={t("enterprise.lead")}
        />

        <Reveal delay={80} className="mt-14">
          {/* An institutional lecture, from the client's brief. */}
          <figure className="group relative aspect-21/9 overflow-hidden rounded-[14px] border border-line shadow-card">
            <Image
              src="/photos/lecture.jpg"
              alt={t("enterprise.photo_alt")}
              fill
              sizes="(max-width: 1200px) 100vw, 1200px"
              className="object-cover object-center transition-transform duration-700 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-cove-deep/70 via-cove-deep/5 to-transparent"
            />
            <figcaption className="font-display cove-eyebrow absolute inset-x-0 bottom-0 p-6 text-[13px] uppercase tracking-[0.14em] text-white/85">
              {t("enterprise.photo_alt")}
            </figcaption>
          </figure>
        </Reveal>

        {/*
         * Three claims, not three statistics — the figures are outcomes the
         * client's own customers reported, so they are stated as headlines
         * rather than dressed up as measured data.
         *
         * The ordinal is a watermark behind the icon rather than a second
         * badge above the heading. These three are outcomes, not a sequence,
         * so the numbers are a reading aid and should stay quiet.
         */}
        <ul className="mt-12 grid gap-5 md:grid-cols-3">
          {outcomes.map((outcome, index) => (
            <Reveal as="li" key={outcome.title} delay={index * 90}>
              <Card hue="coral" className="p-8">
                <span
                  aria-hidden="true"
                  className="font-display tabular absolute -top-2 right-4 text-[76px] font-bold leading-none text-cove-coral/10"
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span
                  aria-hidden="true"
                  className="cove-grad-warm relative grid size-12 place-items-center rounded-[12px] text-white shadow-[0_8px_20px_-8px_rgb(245_107_97/0.7)] transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                >
                  <outcome.Icon className="size-6" />
                </span>
                <h3 className="relative mt-5 text-[19px] font-bold leading-snug text-ink">
                  {outcome.title}
                </h3>
                <p className="relative mt-3 text-[15px] leading-[1.7] text-sub">
                  {outcome.body}
                </p>
              </Card>
            </Reveal>
          ))}
        </ul>
      </Shell>
    </Section>
  );
}
