import { Section, SectionHead, Shell } from "@/components/site/section";
import type { ProductT } from "@/i18n/types";
import { Points } from "./points";

/** What the student sees. */
export function Students({ t }: { t: ProductT }) {
  return (
    <Section id="students" ground="cool">
      <Shell>
        <SectionHead
          hue="blue"
          eyebrow={t("student.eyebrow")}
          title={t("student.title")}
          lead={t("student.lead")}
        />
        <div className="mt-14">
          <Points
            hue="blue"
            points={[
              {
                title: t("student.point_1_title"),
                body: t("student.point_1_body"),
              },
              {
                title: t("student.point_2_title"),
                body: t("student.point_2_body"),
              },
              {
                title: t("student.point_3_title"),
                body: t("student.point_3_body"),
              },
              {
                title: t("student.point_4_title"),
                body: t("student.point_4_body"),
              },
            ]}
          />
        </div>
      </Shell>
    </Section>
  );
}
