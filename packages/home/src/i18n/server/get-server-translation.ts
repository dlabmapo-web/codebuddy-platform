import type { TFunction } from "i18next";
import type { Locale } from "@cove/i18n/settings";

import { initTranslations } from "../init-translations";
import type { SiteNamespace } from "../namespaces";
import { getLocale } from "./get-locale";

/**
 * Translations for server components and `generateMetadata`.
 *
 * The marketing site is almost entirely server-rendered, so this — not the
 * client hook — is the path nearly every string takes.
 */
export async function getServerTranslation<
  const Ns extends readonly [SiteNamespace, ...SiteNamespace[]],
>(namespaces: Ns): Promise<{ locale: Locale; t: TFunction<Ns> }> {
  const locale = await getLocale();
  const { i18n } = await initTranslations(locale, namespaces);
  return { locale, t: i18n.t as unknown as TFunction<Ns> };
}
