import type RFB from "@novnc/novnc/lib/rfb";
type ViewerBundle = { default: typeof RFB; releaseCapture?: () => void };
export function releaseRfbCapture() {
  (window as unknown as { CoveVNC?: ViewerBundle }).CoveVNC?.releaseCapture?.();
}
let loading: Promise<typeof RFB> | undefined;
export function loadRfb() {
  if (loading) return loading;
  loading = new Promise<typeof RFB>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/novnc-rfb.js?v=1.6.0-course-2";
    script.onload = () => {
      const api = (window as unknown as { CoveVNC?: ViewerBundle })
        .CoveVNC;
      if (api?.default) resolve(api.default);
      else {
        loading = undefined;
        reject(new Error("Viewer unavailable"));
      }
    };
    script.onerror = () => {
      loading = undefined;
      script.remove();
      reject(new Error("Viewer unavailable"));
    };
    document.head.append(script);
  });
  return loading;
}
