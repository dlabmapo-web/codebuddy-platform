import { PartnerWall } from "@/components/site/partner-wall";
import { Reveal } from "@/components/site/reveal";
import { Section, SectionHead, Shell } from "@/components/site/section";
import type { MarketingT } from "@/i18n/types";

/** 파트너사 — who the company has worked with. */
export function Partners({ t }: { t: MarketingT }) {
  return (
    <Section id="partners" ground="mist">
      <Shell>
        <SectionHead
          hue="sun"
          eyebrow={t("partners.eyebrow")}
          title={t("partners.title")}
          lead={t("partners.note")}
        />
        <Reveal delay={80} className="mt-12">
          <PartnerWall />
        </Reveal>
      </Shell>
    </Section>
  );
}
