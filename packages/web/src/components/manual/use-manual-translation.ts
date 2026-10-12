"use client";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import en from "@cove/i18n/locales/en/manual.json";
import ko from "@cove/i18n/locales/ko/manual.json";
import { useLocale } from "@/i18n";
import { initTranslationsSync } from "@/i18n/init-translations";
// Feature-scoped resources keep this copy out of the shared layout payload.
export function useManualTranslation() {
  const locale = useLocale();
  const instance = useMemo(
    () =>
      initTranslationsSync(locale, ["manual"], {
        en: { manual: en },
        ko: { manual: ko },
      }),
    [locale],
  );
  return useTranslation("manual", { i18n: instance });
}
