import type { Locale } from "@cove/i18n/settings";

import type { MarketingT } from "@/i18n/types";
import { Footer } from "./footer";
import { Header } from "./header";

/*
 * The header and footer, with their copy already wired.
 *
 * Both pages were repeating forty lines of identical prop mapping, which is
 * how a nav item ends up present on one page and missing from the other. Each
 * page now names only what actually differs: which link is current, and what
 * the header is sitting on.
 *
 * Both take a `marketing`-scoped `t`, so the product page resolves that
 * namespace alongside its own rather than prefixing every key with
 * `marketing:` at the call site.
 */

export function SiteHeader({
  t,
  locale,
  /** `/cove-studio` on the product page; nothing on the company page. */
  activeHref,
  heroTone = "light",
  contactHref = "#contact",
}: {
  t: MarketingT;
  locale: Locale;
  activeHref?: string;
  heroTone?: "light" | "deep";
  contactHref?: string;
}) {
  const links = [
    { href: "#about", label: t("nav.about") },
    { href: "#areas", label: t("nav.areas") },
    { href: "/cove-studio", label: t("nav.studio") },
    { href: "#training", label: t("nav.training") },
    { href: "#partners", label: t("nav.partners") },
  ];

  return (
    <Header
      locale={locale}
      heroTone={heroTone}
      contactHref={contactHref}
      copy={{
        home: t("nav.home"),
        menu: t("nav.menu"),
        close: t("nav.close"),
        cta: t("nav.cta"),
        language: t("footer.language"),
      }}
      links={links.map((link) => ({
        ...link,
        // Away from the company page the in-page anchors have to be absolute,
        // or `#about` would look for a section that is not on this document.
        href:
          contactHref.startsWith("/") && link.href.startsWith("#")
            ? `/${link.href}`
            : link.href,
        active: link.href === activeHref,
      }))}
    />
  );
}

export function SiteFooter({ t }: { t: MarketingT }) {
  return (
    <Footer
      copy={{
        home: t("nav.home"),
        tagline: t("footer.tagline"),
        companyLabel: t("footer.company_label"),
        productLabel: t("footer.product_label"),
        contactLabel: t("footer.contact_label"),
        studioLink: t("footer.studio_link"),
        studioApp: t("footer.studio_app"),
        mvpApp: t("footer.mvp_app"),
        campusLink: t("footer.campus_link"),
        aboutLink: t("nav.about"),
        areasLink: t("nav.areas"),
        phone: t("contact.phone"),
        hours: t("contact.hours"),
        rights: t("footer.rights"),
      }}
    />
  );
}
