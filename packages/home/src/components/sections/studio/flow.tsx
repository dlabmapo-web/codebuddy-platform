import { Reveal } from "@/components/site/reveal";
import { Section, SectionHead, Shell } from "@/components/site/section";
import { Card, IconPlate } from "@/components/ui/card";
import { Code, Layers, TrendingUp, Users } from "@/components/ui/icons";
import type { ProductT } from "@/i18n/types";

/**
 * Curriculum → class → lesson → data.
 *
 * Numbered because it is a real pipeline and the reader needs the order to
 * work out where their own teaching would sit in it.
 */
export function Flow({ t }: { t: ProductT }) {
  const steps = [
    { Icon: Layers, title: t("flow.step_1_title"), body: t("flow.step_1_body") },
    { Icon: Users, title: t("flow.step_2_title"), body: t("flow.step_2_body") },
    { Icon: Code, title: t("flow.step_3_title"), body: t("flow.step_3_body") },
    {
      Icon: TrendingUp,
      title: t("flow.step_4_title"),
      body: t("flow.step_4_body"),
    },
  ];

  return (
    <Section ground="teal">
      <Shell>
        <SectionHead
          hue="blue"
          eyebrow={t("flow.eyebrow")}
          title={t("flow.title")}
        />
        <ol className="mt-14 grid gap-5 md:grid-cols-4">
          {steps.map((step, index) => (
            <Reveal as="li" key={step.title} delay={index * 80}>
              <Card hue="blue" className="p-7">
                <div className="flex items-center gap-3">
                  <IconPlate hue="blue">
                    <step.Icon className="size-6" />
                  </IconPlate>
                  <span className="font-display tabular text-[13px] font-bold tracking-[0.12em] text-cove-blue/55">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mt-5 text-[17px] font-bold text-ink">
                  {step.title}
                </h3>
                <p className="mt-2.5 text-[15px] leading-[1.7] text-sub">
                  {step.body}
                </p>
              </Card>
            </Reveal>
          ))}
        </ol>
      </Shell>
    </Section>
  );
}
