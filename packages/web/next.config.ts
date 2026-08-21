import type { NextConfig } from "next";

const crossOriginIsolationHeaders = [
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // `credentialless` is not implemented by Safari, which leaves
  // `crossOriginIsolated` false and makes SharedArrayBuffer unavailable.
  // `require-corp` is supported by Safari, Chromium, and Firefox; all Python
  // runtime assets are same-origin and explicitly carry CORP below.
  { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
];

// 워커/파이오다이드 자원(같은 출처 하위 리소스)에 CORP 부여 (COEP 는 전역 규칙에서 적용)
//
// Pyodide ships ~13 MB of assets (a 10 MB wasm, a 2.4 MB stdlib zip). They are
// pinned to a checked-in release and change only when that release is upgraded,
// so they are cached immutably: a student pays the download once, not once per
// session. The worker is versioned by the `?v=` query its loader appends.
const workerAssetHeaders = [
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
];

const nextConfig: NextConfig = {
  transpilePackages: ["@cove/shared", "@cove/i18n"],
  async headers() {
    return [
      // 전 경로에 cross-origin isolation 적용 → 어느 진입 경로(SPA 네비게이션 포함)에서도
      // crossOriginIsolated 가 유지되어 워커+SharedArrayBuffer 대화식 입력이 동작한다.
      {
        source: "/:path*",
        headers: crossOriginIsolationHeaders,
      },
      // The recovery confirmation carries a one-time token in its query string,
      // and the reset page is reached with a live recovery session in cookies.
      // A referrer carrying that query to any resource the page loads is the
      // token leaving the person it was sent to; the pages load no third-party
      // resource for the same reason.
      //
      // Storage is already covered and is deliberately not repeated here: both
      // routes read cookies or search params, so Next renders them dynamically
      // and sends `private, no-cache, no-store, max-age=0, must-revalidate`
      // itself, overriding anything configured at this layer. `next dev` sends
      // `no-cache, must-revalidate` because development never caches a page.
      {
        source: "/auth/recovery/confirm",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
      {
        source: "/auth/reset-password",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
      // 워커/파이오다이드 자원은 같은 출처 하위 리소스로 로드되도록 CORP 추가
      {
        source: "/pyodide-worker.js",
        headers: workerAssetHeaders,
      },
      {
        source: "/pyodide/:path*",
        headers: workerAssetHeaders,
      },
    ];
  },
};

export default nextConfig;
