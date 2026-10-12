"use client";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import en from "@cove/i18n/locales/en/video.json";
import ko from "@cove/i18n/locales/ko/video.json";
import { useLocale } from "@/i18n";
import { initTranslationsSync } from "@/i18n/init-translations";
export function useVideoTranslation() {
  const locale = useLocale();
  const instance = useMemo(
    () =>
      initTranslationsSync(locale, ["video"], {
        en: { video: en },
        ko: { video: ko },
      }),
    [locale],
  );
  return useTranslation("video", { i18n: instance });
}
