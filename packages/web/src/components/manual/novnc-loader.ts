import type RFB from "@novnc/novnc/lib/rfb";
let loading: Promise<typeof RFB> | undefined;
export function loadRfb() {
  if (loading) return loading;
  loading = new Promise<typeof RFB>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/novnc-rfb.js?v=1.6.0";
    script.onload = () => {
      const api = (window as unknown as { CoveVNC?: { default: typeof RFB } })
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
