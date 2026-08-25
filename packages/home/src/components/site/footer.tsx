import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { Shell } from "./section";

export type FooterCopy = {
  home: string;
  tagline: string;
  companyLabel: string;
  productLabel: string;
  contactLabel: string;
  studioLink: string;
  studioApp: string;
  campusLink: string;
  aboutLink: string;
  areasLink: string;
  phone: string;
  hours: string;
  rights: string;
};

export function Footer({ copy }: { copy: FooterCopy }) {
  return (
    <footer className="bg-cove-deep text-on-deep">
      <Shell>
        <div className="grid gap-12 py-16 md:grid-cols-12 lg:py-20">
          <div className="md:col-span-5">
            <Logo label={copy.home} tone="onDeep" />
            <p className="mt-5 max-w-[32ch] text-[15px] leading-relaxed text-white/60">
              {copy.tagline}
            </p>
          </div>

          <nav className="md:col-span-3">
            <h2 className="font-display text-[13px] font-semibold uppercase tracking-[0.14em] text-white/50">
              {copy.companyLabel}
            </h2>
            <ul className="mt-5 space-y-3 text-[15px]">
              <li>
                <Link
                  href="/#about"
                  className="text-white/80 transition-colors hover:text-white"
                >
                  {copy.aboutLink}
                </Link>
              </li>
              <li>
                <Link
                  href="/#areas"
                  className="text-white/80 transition-colors hover:text-white"
                >
                  {copy.areasLink}
                </Link>
              </li>
              <li>
                <Link
                  href="/#campus"
                  className="text-white/80 transition-colors hover:text-white"
                >
                  {copy.campusLink}
                </Link>
              </li>
            </ul>
          </nav>

          <nav className="md:col-span-2">
            <h2 className="font-display text-[13px] font-semibold uppercase tracking-[0.14em] text-white/50">
              {copy.productLabel}
            </h2>
            <ul className="mt-5 space-y-3 text-[15px]">
              <li>
                <Link
                  href="/cove-studio"
                  className="text-white/80 transition-colors hover:text-white"
                >
                  {copy.studioLink}
                </Link>
              </li>
              <li>
                {/*
                 * The only outbound link on the site: the real application,
                 * which is a different origin in every environment.
                 */}
                <a
                  href={
                    process.env.NEXT_PUBLIC_STUDIO_URL ??
                    "https://cs.coveedu.com"
                  }
                  className="text-white/80 transition-colors hover:text-white"
                >
                  {copy.studioApp}
                </a>
              </li>
            </ul>
          </nav>

          <div className="md:col-span-2">
            <h2 className="font-display text-[13px] font-semibold uppercase tracking-[0.14em] text-white/50">
              {copy.contactLabel}
            </h2>
            <p className="mt-5">
              <a
                href={`tel:${copy.phone.replace(/[^\d+]/g, "")}`}
                className="font-display text-[17px] font-semibold tracking-tight text-white transition-colors hover:text-cove-sun"
              >
                {copy.phone}
              </a>
            </p>
            <p className="mt-2 text-[14px] text-white/50">{copy.hours}</p>
          </div>
        </div>

        <div className="border-t border-white/10 py-7">
          <p className="text-[13px] text-white/40">{copy.rights}</p>
        </div>
      </Shell>
    </footer>
  );
}
