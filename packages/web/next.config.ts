import type { NextConfig } from "next";

const crossOriginIsolationHeaders = [
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
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
