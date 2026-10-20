"use client";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import en from "@cove/i18n/locales/en/practice.json";
import ko from "@cove/i18n/locales/ko/practice.json";
import { useLocale } from "@/i18n";
import { initTranslationsSync } from "@/i18n/init-translations";
// Feature-scoped resources keep this copy out of the shared layout payload.
export function usePracticeTranslation() {
  const locale = useLocale();
  const instance = useMemo(
    () =>
      initTranslationsSync(locale, ["practice"], {
        en: { practice: en },
        ko: { practice: ko },
      }),
    [locale],
  );
  return useTranslation("practice", { i18n: instance });
}
