import { describe, expect, it, vi } from "vitest";

import { ManualAssetsService, rasterImageType, remoteImageName } from "../manual/manual-assets.service.js";
import { copyableImageUrl, remoteImageSources, rewriteRemoteImages } from "./lesson-images.js";

const PNG = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(32, 1)]);
const GIF = Buffer.concat([Buffer.from("GIF89a", "latin1"), Buffer.alloc(32, 2)]);
const elice = "https://cdn-api.elice.io/api/file/abc/shelter.png?se=2026&amp;sig=x";

describe("outside pictures in a statement (QA-006)", () => {
  it("finds allowed HTTPS pictures once each and ignores the rest", () => {
    const html = `
      <p><img src="${elice}" alt="1"></p>
      <img alt="again" src='${elice}'>
      <img src="https://u.jungol.co.kr/a.gif">
      <img src="http://cdn-api.elice.io/plain-http.png">
      <img src="https://evil.example/a.png">
      <img src="cove-asset:7c9e6679-7425-40de-944b-e07fc1f90ae7">`;
    expect(remoteImageSources(html)).toEqual([
      "https://cdn-api.elice.io/api/file/abc/shelter.png?se=2026&sig=x",
      "https://u.jungol.co.kr/a.gif",
    ]);
    expect(copyableImageUrl("https://blog.kakaocdn.net/x.png")).toBeNull();
  });

  it("points copied pictures at the asset and keeps the original URL", () => {
    const id = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
    const html = `<p><img alt="map" src="${elice}"><img src="https://u.jungol.co.kr/a.gif"></p>`;
    const out = rewriteRemoteImages(html, new Map([["https://cdn-api.elice.io/api/file/abc/shelter.png?se=2026&sig=x", id]]));
    expect(out).toBe(
      `<p><img data-source-url="${elice}" alt="map" src="cove-asset:${id}"><img src="https://u.jungol.co.kr/a.gif"></p>`,
    );
  });

  it("recognises raster pictures by content and never stores SVG from elsewhere", () => {
    expect(rasterImageType(PNG)).toEqual({ mime: "image/png", extension: "png" });
    expect(rasterImageType(GIF)).toEqual({ mime: "image/gif", extension: "gif" });
    expect(rasterImageType(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(rasterImageType(Buffer.from("<html>Invalid Session</html>"))).toBeNull();
  });

  it("names assets safely from the URL", () => {
    expect(remoteImageName(new URL("https://cdn-api.elice.io/f/%EB%8C%80%ED%94%BC%EC%86%8C_1.png"), "png", 0)).toBe("____1.png");
    expect(remoteImageName(new URL("https://u.jungol.co.kr/q/map-2.jpeg"), "jpg", 3)).toBe("map-2.jpg");
    expect(remoteImageName(new URL("https://u.jungol.co.kr/"), "gif", 3)).toBe("image-4.gif");
  });
});

describe("ManualAssetsService.copyRemoteImages", () => {
  const academyId = "20000000-0000-4000-8000-000000000001";
  const courseId = "40000000-0000-4000-8000-000000000001";

  function service(existing: Array<{ id: string; sha256: string }> = []) {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    const db = {
      manualAsset: {
        findMany: vi.fn().mockResolvedValue(existing),
        createMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const config = { getOrThrow: () => "https://storage.test" };
    const assets = new ManualAssetsService(config as never, db as never);
    (assets as unknown as { client: unknown }).client = { storage: { from: () => ({ upload, remove }) } };
    return { assets, db, upload };
  }

  const respond = (routes: Record<string, () => Response>) =>
    vi.fn(async (url: URL | string) => (routes[String(url)] ?? (() => new Response("missing", { status: 404 })))());

  it("copies reachable pictures, leaves broken ones, and saves the save", async () => {
    const { assets, db, upload } = service();
    const fetcher = respond({
      "https://cdn-api.elice.io/ok.png": () => new Response(PNG, { status: 200 }),
      "https://u.jungol.co.kr/gone.gif": () => new Response("Invalid Session", { status: 200 }),
    });
    const html = `<img src="https://cdn-api.elice.io/ok.png"><img src="https://u.jungol.co.kr/gone.gif"><img src="https://cdn-api.elice.io/404.png">`;
    const result = await assets.copyRemoteImages(academyId, courseId, html, fetcher as never);

    expect(result.copied).toEqual(["https://cdn-api.elice.io/ok.png"]);
    expect(result.failed.sort()).toEqual(["https://cdn-api.elice.io/404.png", "https://u.jungol.co.kr/gone.gif"]);
    expect(result.html).toMatch(/^<img data-source-url="https:\/\/cdn-api\.elice\.io\/ok\.png" src="cove-asset:[0-9a-f-]{36}">/);
    expect(result.html).toContain(`<img src="https://u.jungol.co.kr/gone.gif">`);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(db.manualAsset.findMany).toHaveBeenCalledTimes(1);
    expect(db.manualAsset.createMany).toHaveBeenCalledTimes(1);
  });

  it("reuses a picture the course already holds", async () => {
    const { createHash } = await import("node:crypto");
    const sha256 = createHash("sha256").update(PNG).digest("hex");
    const { assets, db, upload } = service([{ id: "7c9e6679-7425-40de-944b-e07fc1f90ae7", sha256 }]);
    const fetcher = respond({ "https://cdn-api.elice.io/ok.png": () => new Response(PNG) });
    const result = await assets.copyRemoteImages(academyId, courseId, `<img src="https://cdn-api.elice.io/ok.png">`, fetcher as never);
    expect(result.html).toContain("cove-asset:7c9e6679-7425-40de-944b-e07fc1f90ae7");
    expect(upload).not.toHaveBeenCalled();
    expect(db.manualAsset.createMany).not.toHaveBeenCalled();
  });

  it("follows a redirect only within the allowed hosts", async () => {
    const { assets } = service();
    const fetcher = respond({
      "https://cdn-api.elice.io/moved.png": () => new Response(null, { status: 302, headers: { location: "https://evil.example/x.png" } }),
      "https://cdn-api.elice.io/hop.png": () => new Response(null, { status: 301, headers: { location: "/final.png" } }),
      "https://cdn-api.elice.io/final.png": () => new Response(PNG),
    });
    const result = await assets.copyRemoteImages(
      academyId, courseId,
      `<img src="https://cdn-api.elice.io/moved.png"><img src="https://cdn-api.elice.io/hop.png">`,
      fetcher as never,
    );
    expect(result.failed).toEqual(["https://cdn-api.elice.io/moved.png"]);
    expect(result.copied).toEqual(["https://cdn-api.elice.io/hop.png"]);
  });

  it("refuses pictures over 5 MiB", async () => {
    const { assets } = service();
    const big = Buffer.concat([PNG, Buffer.alloc(5_242_881)]);
    const fetcher = respond({ "https://cdn-api.elice.io/big.png": () => new Response(big) });
    const result = await assets.copyRemoteImages(academyId, courseId, `<img src="https://cdn-api.elice.io/big.png">`, fetcher as never);
    expect(result.failed).toEqual(["https://cdn-api.elice.io/big.png"]);
  });

  it("does nothing, and reads nothing, for a statement without outside pictures", async () => {
    const { assets, db } = service();
    const fetcher = vi.fn();
    const html = `<p>No pictures</p><img src="cove-asset:7c9e6679-7425-40de-944b-e07fc1f90ae7">`;
    expect(await assets.copyRemoteImages(academyId, courseId, html, fetcher as never)).toEqual({ html, copied: [], failed: [] });
    expect(fetcher).not.toHaveBeenCalled();
    expect(db.manualAsset.findMany).not.toHaveBeenCalled();
  });
});
