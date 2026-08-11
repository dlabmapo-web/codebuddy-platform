import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";
import { getLocale } from "@/i18n/server/get-locale";

/*
 * The Latin structural layer — eyebrows, section labels, ordinals — and
 * nothing else. Korean and all body copy stay in Pretendard, which globals.css
 * imports as a self-hosted subset.
 *
 * `next/font` self-hosts at build time, so this costs no runtime request to
 * Google and leaks no visitor IP to it.
 */
const grotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-grotesk",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const ko = locale === "ko";

  return {
    title: {
      default: ko
        ? "코브에듀 — 배움에서 경험으로, 경험에서 가능성으로"
        : "COVE Edu — From learning to experience, from experience to possibility",
      template: ko ? "%s | 코브에듀" : "%s | COVE Edu",
    },
    description: ko
      ? "코브에듀는 AI·코딩 교육과 에듀테크 솔루션을 통해 학생부터 대학, 기업, 공공기관까지 다양한 교육 현장에 새로운 학습 경험을 제공합니다."
      : "COVE Edu brings new learning experiences to schools, universities, companies, and public institutions through AI and coding education and edtech solutions.",
    metadataBase: new URL("https://coveedu.com"),
    openGraph: {
      type: "website",
      siteName: ko ? "코브에듀" : "COVE Edu",
      locale: ko ? "ko_KR" : "en_US",
    },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();

  return (
    // `data-scroll-behavior="smooth"` is required in Next 16 for the framework
    // to keep overriding `scroll-behavior` during route transitions; without it
    // the anchor nav's smooth scroll would also apply to page navigation.
    // See node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md.
    <html
      className={grotesk.variable}
      lang={locale}
      data-scroll-behavior="smooth"
    >
      <body>{children}</body>
    </html>
  );
}
