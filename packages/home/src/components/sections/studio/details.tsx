import { Reveal } from "@/components/site/reveal";
import { Section, SectionHead, Shell, Stagger } from "@/components/site/section";
import { IconPlate } from "@/components/ui/card";
import { Contrast, Globe, ShieldCheck, Window } from "@/components/ui/icons";
import type { ProductT } from "@/i18n/types";

/** The practical things that used to get in the way of a lesson. */
export function Details({ t }: { t: ProductT }) {
  const items = [
    {
      Icon: Globe,
      hue: "blue",
      title: t("detail.item_1_title"),
      body: t("detail.item_1_body"),
    },
    {
      Icon: Contrast,
      hue: "sun",
      title: t("detail.item_2_title"),
      body: t("detail.item_2_body"),
    },
    {
      Icon: Window,
      hue: "teal",
      title: t("detail.item_3_title"),
      body: t("detail.item_3_body"),
    },
    {
      Icon: ShieldCheck,
      hue: "coral",
      title: t("detail.item_4_title"),
      body: t("detail.item_4_body"),
    },
  ] as const;

  return (
    <Section ground="warm">
      <Shell>
        <Stagger
          head={
            <SectionHead
              hue="sun"
              eyebrow={t("detail.eyebrow")}
              title={t("detail.title")}
            />
          }
        >
          <Reveal delay={80}>
            {/*
             * Each detail gets its own hue, so this grid is where all four
             * appear at once — the same four, in the same order, one last time
             * before the page closes.
             */}
            <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
              {items.map((item) => (
                <div key={item.title} className="group flex gap-4">
                  <IconPlate hue={item.hue} className="size-11">
                    <item.Icon className="size-5.5" />
                  </IconPlate>
                  <div className="min-w-0">
                    <dt className="text-[16px] font-bold text-ink">
                      {item.title}
                    </dt>
                    <dd className="mt-1.5 text-[15px] leading-[1.7] text-sub">
                      {item.body}
                    </dd>
                  </div>
                </div>
              ))}
            </dl>
          </Reveal>
        </Stagger>
      </Shell>
    </Section>
  );
}
