import { About } from "@/components/sections/about";
import { Areas } from "@/components/sections/areas";
import { Campus } from "@/components/sections/campus";
import { Contact } from "@/components/sections/contact";
import { Enterprise } from "@/components/sections/enterprise";
import { HeroSection } from "@/components/sections/hero-section";
import { Partners } from "@/components/sections/partners";
import { Startup } from "@/components/sections/startup";
import { StudioPreview } from "@/components/sections/studio-preview";
import { SiteFooter, SiteHeader } from "@/components/site/site-chrome";
import { getServerTranslation } from "@/i18n/server/get-server-translation";

/**
 * The company page: an order, and nothing else.
 *
 * Every section owns its own file under `components/sections/`, so this stays
 * the one place the page's shape can be read at a glance. Translations are
 * resolved once and passed down — no section opens its own i18next instance.
 */
export default async function Page() {
  const { t, locale } = await getServerTranslation(["marketing"]);

  return (
    <>
      <SiteHeader t={t} locale={locale} />

      <main id="main">
        <HeroSection t={t} />
        <About t={t} />
        <Areas t={t} />
        <StudioPreview t={t} />
        <Campus t={t} />
        <Enterprise t={t} />
        <Startup t={t} />
        <Partners t={t} />
        <Contact t={t} />
      </main>

      <SiteFooter t={t} />
    </>
  );
}
