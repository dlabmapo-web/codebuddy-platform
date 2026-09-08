import { Hero } from "@/components/site/hero";
import { BookOpen, Building, GraduationCap, Users } from "@/components/ui/icons";
import type { MarketingT } from "@/i18n/types";

/**
 * The hero, with its four audiences bound to copy.
 *
 * All four photographs are now COVE Edu's own rooms, which is what the panels
 * were always holding a place for: the Mapo classroom mid-lesson, a robotics
 * session with the kits open, a talk from a lecture-hall stage, and the D·LAB
 * Alliance Summit. They replaced four Pexels stock photographs of strangers.
 *
 * The claim this hero makes is that one company teaches a child their first
 * `print()` and briefs a room of executives. Stock photography could only
 * illustrate that claim; these four are evidence for it.
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
