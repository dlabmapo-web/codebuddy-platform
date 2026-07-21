import type { NextConfig } from "next";

const crossOriginIsolationHeaders = [
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
];

// 워커/파이오다이드 자원(같은 출처 하위 리소스)에 CORP 부여 (COEP 는 전역 규칙에서 적용)
const workerAssetHeaders = [
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
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
