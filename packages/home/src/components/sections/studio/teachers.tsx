import { Reveal } from "@/components/site/reveal";
import { Screenshot, TeacherMock } from "@/components/site/screenshot";
import { Section, SectionHead, Shell, Stagger } from "@/components/site/section";
import type { ProductT } from "@/i18n/types";
import { Points } from "./points";

/** What the teacher sees — the live roster, which is what they actually watch. */
export function Teachers({ t }: { t: ProductT }) {
  return (
    <Section id="teachers" ground="mist">
      <Shell>
        <Stagger
          head={
            <SectionHead
              hue="blue"
              eyebrow={t("teacher.eyebrow")}
              title={t("teacher.title")}
              lead={t("teacher.lead")}
            />
          }
        >
          <Reveal delay={80}>
            <Screenshot alt={t("teacher.shot_alt")}>
              <TeacherMock />
            </Screenshot>
          </Reveal>
        </Stagger>

        <div className="mt-14">
          <Points
            hue="blue"
            points={[
              {
                title: t("teacher.point_1_title"),
                body: t("teacher.point_1_body"),
              },
              {
                title: t("teacher.point_2_title"),
                body: t("teacher.point_2_body"),
              },
              {
                title: t("teacher.point_3_title"),
                body: t("teacher.point_3_body"),
              },
              {
                title: t("teacher.point_4_title"),
                body: t("teacher.point_4_body"),
              },
            ]}
          />
        </div>
      </Shell>
    </Section>
  );
}
