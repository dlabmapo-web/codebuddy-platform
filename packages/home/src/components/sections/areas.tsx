import { Reveal } from "@/components/site/reveal";
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
      Icon: BookOpen,
      label: t("areas.education_label"),
      body: t("areas.education_body"),
      detail: t("areas.education_detail"),
    },
    {
      hue: "blue",
      Icon: MonitorPlay,
      label: t("areas.solution_label"),
      body: t("areas.solution_body"),
      detail: t("areas.solution_detail"),
    },
    {
      hue: "coral",
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
              <Card hue={item.hue} className="p-7">
                <IconPlate hue={item.hue}>
                  <item.Icon className="size-6" />
                </IconPlate>
                <h3 className="mt-5 flex items-center gap-1.5 text-[20px] font-bold text-ink">
                  {item.label}
                  <ChevronRight className="size-4 text-sub transition-transform duration-300 group-hover:translate-x-1 group-hover:text-cove-blue motion-reduce:transition-none motion-reduce:group-hover:translate-x-0" />
                </h3>
                <p className="mt-3 text-[15px] font-medium text-ink/70">
                  {item.body}
                </p>
                <p className="mt-4 text-[15px] leading-[1.75] text-sub">
                  {item.detail}
                </p>
              </Card>
            </Reveal>
          ))}
        </ul>
      </Shell>
    </Section>
  );
}
