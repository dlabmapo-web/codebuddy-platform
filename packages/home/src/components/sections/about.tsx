import { Reveal } from "@/components/site/reveal";
import { Section, SectionHead, Shell, Stagger } from "@/components/site/section";
import type { MarketingT } from "@/i18n/types";

/** 회사소개 — the positioning, and the one claim only this company can make. */
export function About({ t }: { t: MarketingT }) {
  return (
    <Section id="about" ground="mist">
      <Shell>
        <Stagger
          head={
            <SectionHead
              hue="blue"
              eyebrow={t("about.eyebrow")}
              title={t("about.title")}
            />
          }
        >
          <Reveal delay={80} className="space-y-6">
            <p className="text-[19px] leading-[1.8] text-ink lg:text-[21px]">
              {t("about.body")}
            </p>
            <p className="text-[17px] leading-[1.8] text-sub">
              {t("about.body_2")}
            </p>
          </Reveal>
        </Stagger>
      </Shell>
    </Section>
  );
}
