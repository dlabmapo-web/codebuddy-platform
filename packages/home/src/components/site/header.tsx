"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Locale } from "@cove/i18n/settings";

import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import { Menu, X } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { LanguageControl } from "./language-switch";
import { Shell } from "./section";

export type NavLink = {
  href: string;
  label: string;
  /** The page the reader is on, so the nav says where they are. */
  active?: boolean;
};

export type HeaderCopy = {
  home: string;
  menu: string;
  close: string;
  cta: string;
  language: string;
};

/**
 * Sticky, and transparent only until the reader scrolls.
 *
 * The hero's four audience panels run to the top of the viewport; a solid bar
 * over them would cut the first one off. Past the fold the header takes a
 * background and a hairline so it never floats over body copy.
 *
 * `heroTone` is what the header is currently sitting on. The product page
 * opens on the deep blue band, and a header that assumed a light hero would
 * render its ink wordmark on navy — invisible until the first scroll. Once
 * scrolled the header has its own paper background, so the tone reverts.
 */
export function Header({
  links,
  copy,
  locale,
  heroTone = "light",
  contactHref = "#contact",
}: {
  links: NavLink[];
  copy: HeaderCopy;
  locale: Locale;
  heroTone?: "light" | "deep";
  /** `#contact` on the landing page; `/#contact` from anywhere else. */
  contactHref?: string;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  const onDeep = heroTone === "deep" && !scrolled && !open;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // A menu that stays open behind a closed sheet would keep the page locked.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-colors duration-300",
        scrolled || open
          ? "border-b border-line bg-paper/90 backdrop-blur-md"
          : "border-b border-transparent",
      )}
    >
      <Shell>
        <div className="flex h-[72px] items-center justify-between gap-6">
          <Link href="/" aria-label={copy.home} className="shrink-0">
            <Logo label={copy.home} tone={onDeep ? "onDeep" : "ink"} />
          </Link>

          {/*
           * Hover and the current page are both marked by a rule in the brand
           * gradient that grows from the centre. Colour alone would not carry
           * "you are here" for a reader who cannot separate the two greys, and
           * a bar that grows is legible before the colour registers.
           */}
          <nav className="hidden items-center gap-8 lg:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={link.active ? "page" : undefined}
                className={cn(
                  "group relative py-1 text-[15px] font-medium transition-colors",
                  onDeep
                    ? "text-white/70 hover:text-white"
                    : "text-sub hover:text-cove-blue",
                  link.active && (onDeep ? "text-white" : "text-cove-blue"),
                )}
              >
                {link.label}
                <span
                  aria-hidden="true"
                  className={cn(
                    "cove-grad-brand absolute -bottom-0.5 left-1/2 h-[2px] w-0 -translate-x-1/2 rounded-full",
                    "transition-[width] duration-300 ease-out group-hover:w-full",
                    "motion-reduce:transition-none",
                    link.active && "w-full",
                  )}
                />
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <div className="hidden sm:block">
              <LanguageControl
                current={locale}
                label={copy.language}
                onDeep={onDeep}
              />
            </div>
            <Link
              href={contactHref}
              className={cn(
                buttonVariants({
                  size: "sm",
                  variant: onDeep ? "onDeepSolid" : "solid",
                }),
                "hidden sm:inline-flex",
              )}
            >
              {copy.cta}
            </Link>
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-label={open ? copy.close : copy.menu}
              className={cn(
                "-mr-2 p-2 lg:hidden",
                onDeep ? "text-on-deep" : "text-ink",
              )}
            >
              {open ? <X className="size-6" /> : <Menu className="size-6" />}
            </button>
          </div>
        </div>
      </Shell>

      {open ? (
        <div className="border-t border-line bg-paper lg:hidden">
          <Shell>
            <nav className="flex flex-col py-2">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="border-b border-line py-4 text-[17px] font-medium text-ink last:border-0"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="flex items-center justify-between gap-4 py-5">
              <LanguageControl current={locale} label={copy.language} />
              <Link
                href={contactHref}
                onClick={() => setOpen(false)}
                className={buttonVariants()}
              >
                {copy.cta}
              </Link>
            </div>
          </Shell>
        </div>
      ) : null}
    </header>
  );
}
