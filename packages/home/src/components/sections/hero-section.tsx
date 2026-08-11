import { Hero } from "@/components/site/hero";
import { BookOpen, Building, GraduationCap, Users } from "@/components/ui/icons";
import type { MarketingT } from "@/i18n/types";

/**
 * The hero, with its four audiences bound to copy.
 *
 * The photographs are Pexels (commercial use, no attribution required), one
 * per audience and matched to the age the audience actually is: the 학생 and
 * 학원·학교 panels show East Asian elementary students, because that is who
 * the platform is for, while 대학 and 기업·공공기관 correctly show adults.
 *
 * Every one is a one-line swap for a real COVE Edu photograph, and worth
 * swapping — the campus section keeps its own real room for exactly this
 * reason.
 */
export function HeroSection({ t }: { t: MarketingT }) {
  return (
    <Hero
      studioHref="/cove-studio"
      contactHref="#contact"
      copy={{
        eyebrow: t("hero.eyebrow"),
        titleLead: t("hero.title_lead"),
        titleRest: t("hero.title_rest"),
        lead: t("hero.lead"),
        ctaPrimary: t("hero.cta_primary"),
        ctaSecondary: t("hero.cta_secondary"),
        audienceLabel: t("hero.audience_label"),
      }}
      audiences={[
        {
          hue: "teal",
          Icon: BookOpen,
          title: t("hero.student_title"),
          body: t("hero.student_body"),
          photo: "/photos/audience/student.jpg",
        },
        {
          hue: "blue",
          Icon: Users,
          title: t("hero.school_title"),
          body: t("hero.school_body"),
          photo: "/photos/audience/school.jpg",
        },
        {
          hue: "coral",
          Icon: GraduationCap,
          title: t("hero.university_title"),
          body: t("hero.university_body"),
          photo: "/photos/audience/university.jpg",
        },
        {
          hue: "sun",
          Icon: Building,
          title: t("hero.enterprise_title"),
          body: t("hero.enterprise_body"),
          photo: "/photos/audience/enterprise.jpg",
        },
      ]}
    />
  );
}
