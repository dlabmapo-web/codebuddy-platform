import Image from "next/image";

import { Reveal } from "@/components/site/reveal";
import { RichText } from "@/components/site/rich-text";
import { Section, SectionHead, Shell } from "@/components/site/section";
import { Card, IconPlate } from "@/components/ui/card";
import {
  BookOpen,
  Building,
  ChevronRight,
  MonitorPlay,
} from "@/components/ui/icons";
import type { MarketingT } from "@/i18n/types";

/** 주요 사업 영역 — the three lines of business, as peers. */
export function Areas({ t }: { t: MarketingT }) {
  const items = [
    {
      hue: "teal",
      href: "#campus",
      /*
       * Knowingly the same photograph as the hero's 학생 tile, a screen above.
       *
       * The home page has eight slots that want a distinct photograph and the
       * client has supplied seven, and every student-appropriate one is
       * already spoken for by a hero tile — so whichever this card takes, it
       * repeats the tile above it. Reviewed and accepted rather than missed:
       * the two are far apart, and cropped differently enough (4:5 portrait
       * against this 4:3 landscape) not to read as an obvious repeat.
       *
       * An eighth classroom photograph closes it, and nothing else does.
       */
      photo: "/photos/audience/student.jpg",
      Icon: BookOpen,
      label: t("areas.education_label"),
      body: t("areas.education_body"),
      detail: t("areas.education_detail"),
    },
    {
      hue: "blue",
      href: "/cove-studio",
      photo: "/shots/student-courses-light.png",
      Icon: MonitorPlay,
      label: t("areas.solution_label"),
      body: t("areas.solution_body"),
      detail: t("areas.solution_detail"),
    },
    {
      hue: "coral",
      href: "#training",
      /*
       * Not the hero's enterprise tile: the home page shows this card and that
       * tile on the same scroll, and the same photograph twice reads as a
       * stock library rather than a company with its own rooms.
       *
       * Built from a 900px preview rather than the client's original, which
       * did not survive — see §10.1 of the 2026-09-08 spec. It is the only
       * image on the site without a full-resolution master, so it renders
       * correctly at this card's 334x251 and should not be reused larger
       * until the original is re-supplied.
       */
      photo: "/photos/seminar.jpg",
      Icon: Building,
      label: t("areas.enterprise_label"),
      body: t("areas.enterprise_body"),
      detail: t("areas.enterprise_detail"),
    },
  ] as const;

  return (
    <Section id="areas" ground="cool">
      <Shell>
        <SectionHead
          centered
          hue="blue"
          eyebrow={t("areas.eyebrow")}
          title={t("areas.title")}
        />
        {/*
         * Cards here rather than dividers: these three are genuine peers, and
         * the reader is meant to compare them rather than read them in order.
         */}
        <ul className="mt-14 grid gap-5 md:grid-cols-3">
          {items.map((item, index) => (
            <Reveal as="li" key={item.label} delay={index * 90}>
              <Card
                hue={item.hue}
                href={item.href}
                className="cove-service-card cove-media-card p-3"
              >
                <div className="cove-service-media relative aspect-[4/3] overflow-hidden rounded-[20px]">
                  <Image
                    src={item.photo}
                    alt=""
                    fill
                    sizes="(min-width: 1200px) 350px, (min-width: 768px) 30vw, 90vw"
                    className={item.hue === "blue" ? "object-contain p-5" : "object-cover"}
                  />
                </div>
                <div className="flex flex-1 flex-col px-4 pt-6 pb-5">
                  <IconPlate hue={item.hue}>
                    <item.Icon className="size-6" />
                  </IconPlate>
                  <h3 className="mt-5 flex items-center gap-1.5 text-[20px] font-bold text-ink">
                    {item.label}
                    <ChevronRight className="size-4 text-sub transition-transform duration-300 group-hover:translate-x-1 group-hover:text-cove-blue motion-reduce:transition-none motion-reduce:group-hover:translate-x-0" />
                  </h3>
                  <p className="mt-3 text-[15px] font-medium text-ink/70">
                    <RichText>{item.body}</RichText>
                  </p>
                  <p className="mt-6 border-t border-current/10 pt-5 text-[15px] leading-[1.75] text-sub">
                    <RichText>{item.detail}</RichText>
                  </p>
                </div>
              </Card>
            </Reveal>
          ))}
        </ul>
      </Shell>
    </Section>
  );
}
