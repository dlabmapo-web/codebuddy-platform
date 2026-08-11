import type { Metadata } from "next";

import { Close } from "@/components/sections/studio/close";
import { Details } from "@/components/sections/studio/details";
import { Flow } from "@/components/sections/studio/flow";
import { StudioHero } from "@/components/sections/studio/hero";
import { Students } from "@/components/sections/studio/students";
import { Teachers } from "@/components/sections/studio/teachers";
import { SiteFooter, SiteHeader } from "@/components/site/site-chrome";
import { getServerTranslation } from "@/i18n/server/get-server-translation";

/** The real application. A different origin in every environment. */
const STUDIO_APP_URL =
  process.env.NEXT_PUBLIC_STUDIO_URL ?? "https://studio.coveedu.com";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslation(["product"]);
  return { title: t("meta.title"), description: t("meta.description") };
}

/**
 * The product page.
 *
 * Two scoped `t`s rather than one prefixed with `marketing:` at forty call
 * sites: `t` is the product copy, `m` is the shared chrome. Sections live in
 * `components/sections/studio/`.
 */
export default async function CoveStudioPage() {
  const [{ t }, { t: m, locale }] = await Promise.all([
    getServerTranslation(["product"]),
    getServerTranslation(["marketing"]),
  ]);

  return (
    <>
      <SiteHeader
        t={m}
        locale={locale}
        activeHref="/cove-studio"
        heroTone="deep"
        contactHref="/#contact"
      />

      <main id="main">
        <StudioHero t={t} appUrl={STUDIO_APP_URL} />
        <Students t={t} />
        <Teachers t={t} />
        <Flow t={t} />
        <Details t={t} />
        <Close t={t} eyebrow={m("contact.eyebrow")} />
      </main>

      <SiteFooter t={m} />
    </>
  );
}
