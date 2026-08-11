import Link from "next/link";

import { Reveal } from "@/components/site/reveal";
import { Section, SectionHead, Shell, Stagger } from "@/components/site/section";
import { buttonVariants } from "@/components/ui/button";
import { ArrowRight, Phone } from "@/components/ui/icons";
import type { MarketingT } from "@/i18n/types";

/** 문의 — the conversion, which for this buyer is a phone number. */
export function Contact({ t }: { t: MarketingT }) {
  const phone = t("contact.phone");

  return (
    <Section id="contact" ground="cool">
      <Shell>
        <Stagger
          head={
            <SectionHead
              hue="sun"
              eyebrow={t("contact.eyebrow")}
              title={t("contact.title")}
              lead={t("contact.lead")}
            />
          }
        >
          <Reveal delay={80} className="space-y-8">
            <div className="rounded-[14px] border border-line bg-paper p-8 shadow-card">
              <p className="font-display cove-eyebrow text-[12px] font-semibold uppercase tracking-[0.14em] text-sub">
                {t("contact.phone_label")}
              </p>
              {/*
               * The single largest piece of type on the page after the
               * headline. For this buyer the phone number is the conversion,
               * not a form.
               */}
              <a
                href={`tel:${phone.replace(/[^\d+]/g, "")}`}
                className="font-display tabular mt-3 flex items-center gap-3 text-[clamp(1.75rem,4vw,2.5rem)] font-bold tracking-[-0.02em] text-ink transition-colors hover:text-cove-blue"
              >
                <Phone className="size-6 shrink-0 text-cove-sun-ink" />
                {phone}
              </a>
              <p className="mt-4 text-[15px] text-sub">
                <span className="text-ink/70">{t("contact.hours_label")}</span>{" "}
                {t("contact.hours")}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <p className="text-[15px] text-sub">{t("contact.studio_label")}</p>
              <Link
                href="/cove-studio"
                className={buttonVariants({ variant: "outline" })}
              >
                {t("contact.studio_cta")}
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </Reveal>
        </Stagger>
      </Shell>
    </Section>
  );
}
