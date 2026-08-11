"use client";

import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check, Languages } from "lucide-react";
import { locales, localeNames, type Locale } from "@cove/i18n/settings";

import { setBrowserLocale } from "@/i18n/client/set-locale";
import { cn } from "@/lib/utils";

/**
 * The same control as the product's, so the two never feel like two companies.
 *
 * Matches `components/studio/header-controls.tsx` in `@cove/web`: the trigger
 * carries the globe and the locale *code* — "what am I reading?" — and the menu
 * carries each language's own name — "what can I switch to?", in the one form
 * the reader who needs it can actually read. The code sits in a fixed-width box
 * so switching never nudges the controls beside it.
 *
 * `onDeep` is the only addition. The product is always on a card; this header
 * spends its first screen over the navy hero.
 */
export function LanguageControl({
  current,
  label,
  onDeep = false,
}: {
  current: Locale;
  label: string;
  onDeep?: boolean;
}) {
  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger
        aria-label={label}
        title={label}
        className={cn(
          "inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] px-2.5 outline-none transition-colors",
          "focus-visible:ring-2 focus-visible:ring-cove-blue/40",
          onDeep
            ? "text-white/70 hover:bg-white/10 hover:text-white data-[state=open]:bg-white/10 data-[state=open]:text-white"
            : "text-sub hover:bg-mist hover:text-ink data-[state=open]:bg-mist data-[state=open]:text-ink",
        )}
      >
        <Languages aria-hidden className="size-[1.05rem]" strokeWidth={1.75} />
        <span className="font-display min-w-[1.5rem] text-center text-[12px] font-bold uppercase tracking-[0.06em]">
          {current}
        </span>
      </DropdownMenuPrimitive.Trigger>

      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align="end"
          sideOffset={6}
          className="cove-pop z-50 min-w-[9rem] rounded-[12px] border border-line bg-paper p-1.5 shadow-lift outline-none"
        >
          <DropdownMenuPrimitive.RadioGroup
            value={current}
            onValueChange={(value) => {
              if (value !== current) setBrowserLocale(value as Locale);
            }}
          >
            {locales.map((locale) => (
              <DropdownMenuPrimitive.RadioItem
                key={locale}
                value={locale}
                className="relative flex cursor-pointer select-none items-center gap-2 rounded-[8px] py-2 pl-8 pr-3 text-[14px] text-ink outline-none transition-colors data-[highlighted]:bg-mist"
              >
                <DropdownMenuPrimitive.ItemIndicator className="absolute left-2.5 flex items-center">
                  <Check className="size-3.5 text-cove-blue" strokeWidth={2.5} />
                </DropdownMenuPrimitive.ItemIndicator>
                {localeNames[locale]}
              </DropdownMenuPrimitive.RadioItem>
            ))}
          </DropdownMenuPrimitive.RadioGroup>
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}
