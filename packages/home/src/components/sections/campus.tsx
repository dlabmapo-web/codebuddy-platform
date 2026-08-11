import Image from "next/image";

import { Reveal } from "@/components/site/reveal";
import { Section, SectionHead, Shell, Stagger } from "@/components/site/section";
import { IconPlate } from "@/components/ui/card";
import { BookOpen, MapPin, Users } from "@/components/ui/icons";
import type { MarketingT } from "@/i18n/types";

/** 디랩코딩학원 마포캠퍼스 — the campus the company actually operates. */
export function Campus({ t }: { t: MarketingT }) {
  const facts = [
    {
      Icon: Users,
      hue: "teal",
      label: t("campus.fact_target_label"),
      value: t("campus.fact_target_value"),
    },
    {
      Icon: BookOpen,
      hue: "blue",
      label: t("campus.fact_course_label"),
      value: t("campus.fact_course_value"),
    },
    {
      Icon: MapPin,
      hue: "coral",
      label: t("campus.fact_place_label"),
      value: t("campus.fact_place_value"),
    },
  ] as const;

  return (
    <Section id="campus" ground="teal">
      <Shell>
        <Stagger
          head={
            <SectionHead
              hue="teal"
              eyebrow={t("campus.eyebrow")}
              title={t("campus.title")}
              lead={t("campus.body")}
            />
          }
        >
          <Reveal delay={80}>
            {/*
             * The classroom at the Mapo campus, from the client's brief.
             *
             * A real room is the whole argument of this section — it is what
             * separates a company that operates a campus from one that says it
             * does. The scrim exists so the caption stays readable over a
             * bright, busy photograph.
             */}
            <figure className="group relative aspect-16/10 overflow-hidden rounded-[14px] border border-line shadow-card">
              <Image
                src="/photos/classroom.jpg"
                alt={t("campus.photo_alt")}
                fill
                sizes="(max-width: 1024px) 100vw, 640px"
                className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-cove-deep/75 via-cove-deep/10 to-transparent"
              />
              <figcaption className="font-display cove-eyebrow absolute inset-x-0 bottom-0 p-6 text-[13px] uppercase tracking-[0.14em] text-white/85">
                {t("campus.photo_alt")}
              </figcaption>
            </figure>

            <dl className="mt-8 grid gap-px overflow-hidden rounded-[14px] border border-line bg-line shadow-card sm:grid-cols-3">
              {facts.map((fact) => (
                <div key={fact.label} className="group bg-paper p-5">
                  <IconPlate hue={fact.hue} className="size-10 rounded-[10px]">
                    <fact.Icon className="size-5" />
                  </IconPlate>
                  <dt className="font-display cove-eyebrow mt-4 text-[12px] font-semibold uppercase tracking-[0.12em] text-sub">
                    {fact.label}
                  </dt>
                  <dd className="mt-1.5 text-[15px] font-medium text-ink">
                    {fact.value}
                  </dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </Stagger>
      </Shell>
    </Section>
  );
}
