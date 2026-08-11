import { Reveal } from "@/components/site/reveal";
import { Section, SectionHead, Shell, Stagger } from "@/components/site/section";
import type { MarketingT } from "@/i18n/types";

/**
 * Coral to sun in five steps, interpolated in sRGB.
 *
 * Written out rather than computed because the CSS wants literals, and five
 * values read more clearly than the loop that would generate them. Each plate
 * blends into the next step's colour, so the ramp is continuous down the list.
 */
const STEP_RAMP = [
  "linear-gradient(135deg, #F56B61, #F6824F)",
  "linear-gradient(135deg, #F6824F, #F8983C)",
  "linear-gradient(135deg, #F8983C, #F9AF2A)",
  "linear-gradient(135deg, #F9AF2A, #FAC517)",
  "linear-gradient(135deg, #FAC517, #F5D24A)",
] as const;

/** 창업 프로그램 — the one genuinely ordered thing on the page. */
export function Startup({ t }: { t: MarketingT }) {
  const steps = [
    {
      kicker: t("startup.step_1_kicker"),
      title: t("startup.step_1_title"),
      items: [
        t("startup.step_1_a"),
        t("startup.step_1_b"),
        t("startup.step_1_c"),
      ],
    },
    {
      kicker: t("startup.step_2_kicker"),
      title: t("startup.step_2_title"),
      items: [t("startup.step_2_a"), t("startup.step_2_b")],
    },
    {
      kicker: t("startup.step_3_kicker"),
      title: t("startup.step_3_title"),
      items: [t("startup.step_3_a"), t("startup.step_3_b")],
    },
    {
      kicker: t("startup.step_4_kicker"),
      title: t("startup.step_4_title"),
      items: [t("startup.step_4_a"), t("startup.step_4_b")],
    },
    {
      kicker: t("startup.step_5_kicker"),
      title: t("startup.step_5_title"),
      items: [t("startup.step_5_a"), t("startup.step_5_b")],
    },
  ];

  return (
    <Section ground="warm">
      <Shell>
        <Stagger
          head={
            <SectionHead
              hue="coral"
              eyebrow={t("startup.eyebrow")}
              title={t("startup.title")}
              lead={t("startup.lead")}
            />
          }
        >
          {/*
           * Ordinals are usually decoration. Here the content is an actual
           * sequence — 아이템 발굴 → 사업계획서 → 지원사업 → IR → MVP — so the
           * numbers carry information the reader needs, and the plates walk
           * from coral to sun so the colour says the same thing the number
           * does: how far through the programme this step sits.
           */}
          <ol className="border-t border-line">
            {steps.map((step, index) => (
              <Reveal
                as="li"
                key={step.title}
                delay={index * 70}
                className="group grid grid-cols-[3.5rem_1fr] gap-x-5 border-b border-line/70 py-7 transition-colors hover:border-cove-coral/40 sm:grid-cols-[4.5rem_1fr] sm:gap-x-8"
              >
                <span
                  aria-hidden="true"
                  className="font-display tabular grid size-12 place-items-center rounded-[12px] text-[16px] font-bold text-white shadow-[0_8px_18px_-8px_rgb(245_107_97/0.6)] transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                  style={{ backgroundImage: STEP_RAMP[index] }}
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <p className="font-display cove-eyebrow text-[12px] font-semibold uppercase tracking-[0.14em] text-sub">
                    {step.kicker}
                  </p>
                  <h3 className="mt-1.5 text-[19px] font-bold text-ink">
                    {step.title}
                  </h3>
                  <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
                    {step.items.map((item) => (
                      <li
                        key={item}
                        className="text-[15px] text-sub before:mr-2 before:text-line before:content-['—']"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </ol>
        </Stagger>
      </Shell>
    </Section>
  );
}
