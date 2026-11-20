import {
  Injectable,
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, createHash } from "node:crypto";
import type { Request } from "express";
import { PrismaService } from "../database/prisma.service.js";
import { remoteImageSources, rewriteRemoteImages, REMOTE_IMAGE_HOSTS } from "../content/lesson-images.js";
const bucket = "turtle-assets";

/** Picture types, keyed by the extensions each may carry. */
const images: Array<{ mime: string; extensions: string[]; matches: (bytes: Buffer) => boolean }> = [
  { mime: "image/png", extensions: ["png"], matches: (b) => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  { mime: "image/jpeg", extensions: ["jpg", "jpeg"], matches: (b) => b[0] === 255 && b[1] === 216 && b[2] === 255 },
  { mime: "image/gif", extensions: ["gif"], matches: (b) => ["GIF87a", "GIF89a"].includes(b.subarray(0, 6).toString("latin1")) },
  { mime: "image/webp", extensions: ["webp"], matches: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
  { mime: "image/avif", extensions: ["avif"], matches: (b) => isoBrands(b).some((brand) => brand === "avif" || brand === "avis") },
  { mime: "image/bmp", extensions: ["bmp"], matches: (b) => b.subarray(0, 2).toString("latin1") === "BM" && b.length > 26 },
  { mime: "image/svg+xml", extensions: ["svg"], matches: () => true },
];
const heifBrands = ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"];

const MAX_ASSET_BYTES = 5_242_880;

/**
 * The raster type of downloaded bytes, by signature. Pictures from other sites
 * are never stored as SVG: their content is not the author's to vouch for.
 */
export function rasterImageType(bytes: Buffer): { mime: string; extension: string } | null {
  for (const image of images) {
    if (image.mime === "image/svg+xml") continue;
    if (image.matches(bytes)) return { mime: image.mime, extension: image.extensions[0]! };
  }
  return null;
}

/** A safe asset name from a picture URL's last path segment. */
export function remoteImageName(url: URL, extension: string, index: number): string {
  const last = decodeURIComponent(url.pathname.split("/").pop() ?? "").replace(/\.[a-z0-9]{1,5}$/i, "");
  const base = last.replace(/[^a-zA-Z0-9_. -]/g, "_").replace(/^[^a-zA-Z0-9_-]+/, "").slice(0, 80);
  return `${base || `image-${index + 1}`}.${extension}`;
}

/**
 * Downloads one picture over HTTPS: no redirect off the allowed hosts, at most
 * 5 MiB, 10 s. Resolves null for anything else, so one bad picture never
 * fails a save.
 */
export async function downloadRemoteImage(href: string, fetcher: typeof fetch = fetch): Promise<Buffer | null> {
  let url = new URL(href);
  const signal = AbortSignal.timeout(10_000);
  for (let hop = 0; hop < 4; hop++) {
    if (url.protocol !== "https:" || !REMOTE_IMAGE_HOSTS.has(url.hostname.toLowerCase())) return null;
    let response: Response;
    try {
      response = await fetcher(url, { redirect: "manual", signal, headers: { accept: "image/*" } });
    } catch {
      return null;
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => undefined);
      if (!location) return null;
      url = new URL(location, url);
      continue;
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    if (Number(response.headers.get("content-length")) > MAX_ASSET_BYTES) {
      await response.body.cancel().catch(() => undefined);
      return null;
    }
    const parts: Buffer[] = [];
    let size = 0;
    try {
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        size += chunk.byteLength;
        if (size > MAX_ASSET_BYTES) return null;
        parts.push(Buffer.from(chunk));
      }
    } catch {
      return null;
    }
    return size ? Buffer.concat(parts) : null;
  }
  return null;
}

export type RemoteImageCopy = {
  html: string;
  /** Pictures now served from our storage. */
  copied: string[];
  /** Pictures that could not be fetched or were not images; left as they were. */
  failed: string[];
};

/** The major and compatible brands of an ISO-BMFF (`ftyp`) file, or none. */
function isoBrands(bytes: Buffer): string[] {
  if (bytes.length < 16 || bytes.subarray(4, 8).toString("latin1") !== "ftyp") return [];
  const end = Math.min(bytes.length, bytes.readUInt32BE(0));
  const brands = [bytes.subarray(8, 12).toString("latin1")];
  for (let at = 16; at + 4 <= end; at += 4) brands.push(bytes.subarray(at, at + 4).toString("latin1"));
  return brands;
}

/**
 * Accepts an SVG only as a static picture. It is only ever shown through
 * `<img>` in a sandboxed frame, where browsers run no SVG script; refusing
 * active and external content as well keeps it a picture wherever it ends up.
 */
function assertStaticSvg(bytes: Buffer): void {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    throw new BadRequestException("SVG must be UTF-8 text");
  }
  const body = text.replace(/^\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*/i, "");
  if (!/^<svg[\s>]/i.test(body) || !/<\/svg\s*>\s*$|\/>\s*$/i.test(body))
    throw new BadRequestException("Not an SVG image");
  if (
    /<!(DOCTYPE|ENTITY)|<(script|foreignObject|iframe|embed|object|audio|video)\b|\son[a-z]+\s*=|javascript:|(href|src)\s*=\s*["']?\s*(https?:|\/\/|data:)|url\(\s*["']?\s*(https?:|\/\/)/i.test(body)
  )
    throw new BadRequestException(
      "SVG must be a static picture without scripts, events or external content",
    );
}

/**
 * What a lesson asset is, decided by its content and checked against its
 * extension. Pictures authors pick from their own computer are recognised by
 * their signature; Turtle data files must be UTF-8 text.
 */
export function lessonAssetMime(name: string, bytes: Buffer): string {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  if (["txt", "csv", "json"].includes(extension)) {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (text.includes("\0")) throw new Error();
      if (extension === "json") JSON.parse(text);
      return extension === "json" ? "application/json" : "text/plain";
    } catch {
      throw new BadRequestException("Invalid data file");
    }
  }
  if (isoBrands(bytes).some((brand) => heifBrands.includes(brand)) && !isoBrands(bytes).some((brand) => brand === "avif"))
    throw new BadRequestException("HEIC photos cannot be shown in browsers; export the photo as JPG or PNG");
  const image = images.find((candidate) => candidate.extensions.includes(extension));
  if (!image)
    throw new BadRequestException("Use a PNG, JPG, GIF, WebP, AVIF, BMP or SVG image, or UTF-8 TXT, CSV or JSON data");
  if (image.mime === "image/svg+xml") assertStaticSvg(bytes);
  else if (!image.matches(bytes))
    throw new BadRequestException(`The file is not a valid ${extension.toUpperCase()} image`);
  return image.mime;
}
@Injectable()
export class ManualAssetsService {
  private readonly client;
  constructor(
    config: ConfigService,
    private readonly db: PrismaService,
  ) {
    this.client = createClient(
      config.getOrThrow("SUPABASE_URL"),
      config.getOrThrow("SUPABASE_SECRET_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  async upload(
    academyId: string,
    courseId: string,
    name: string,
    request: Request,
  ) {
    if (!/^[a-zA-Z0-9_-][a-zA-Z0-9_. -]{0,100}$/.test(name))
      throw new BadRequestException("Invalid asset name");
    const parts: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > MAX_ASSET_BYTES) throw new BadRequestException("Asset exceeds 5 MiB");
      parts.push(Buffer.from(chunk));
    }
    const bytes = Buffer.concat(parts);
    if (!size) throw new BadRequestException("Empty asset");
    const mime = lessonAssetMime(name, bytes);
    const id = randomUUID(),
      key = `${academyId}/${id}`;
    const { error } = await this.client.storage
      .from(bucket)
      .upload(key, bytes, { contentType: mime, upsert: false });
    if (error)
      throw new ServiceUnavailableException("Asset storage is unavailable");
    try {
      await this.db.manualAsset.create({
        data: {
          id,
          academyId,
          courseId,
          objectKey: key,
          name,
          byteSize: size,
          mimeType: mime,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        },
      });
    } catch (error) {
      await this.client.storage.from(bucket).remove([key]);
      throw error;
    }
    return { assetId: id, name, byteSize: size };
  }
  /**
   * Copies pictures a statement shows from allowed outside hosts into this
   * course's private assets and points the statement at the copies (QA-006).
   *
   * Four downloads at a time; a picture this course already holds (same
   * bytes) is reused, not stored twice. Database cost: one read for the
   * reusable assets and one insert for the new ones, however many pictures.
   */
  async copyRemoteImages(
    academyId: string,
    courseId: string,
    html: string,
    fetcher: typeof fetch = fetch,
  ): Promise<RemoteImageCopy> {
    const sources = remoteImageSources(html);
    if (sources.length === 0) return { html, copied: [], failed: [] };

    const downloads: Array<{ href: string; bytes: Buffer | null }> = [];
    for (let at = 0; at < sources.length; at += 4) {
      const batch = sources.slice(at, at + 4);
      downloads.push(...(await Promise.all(batch.map(async (href) => ({ href, bytes: await downloadRemoteImage(href, fetcher) })))));
    }
    const pictures = downloads.flatMap(({ href, bytes }) => {
      const type = bytes ? rasterImageType(bytes) : null;
      return bytes && type ? [{ href, bytes, type, sha256: createHash("sha256").update(bytes).digest("hex") }] : [];
    });
    const failed = sources.filter((href) => !pictures.some((picture) => picture.href === href));
    if (pictures.length === 0) return { html, copied: [], failed };

    const existing = await this.db.manualAsset.findMany({
      where: { academyId, courseId, sha256: { in: [...new Set(pictures.map((p) => p.sha256))] }, mimeType: { startsWith: "image/" } },
      select: { id: true, sha256: true },
    });
    const assetBySha = new Map(existing.map((row) => [row.sha256, row.id]));
    const created: Array<{ id: string; academyId: string; courseId: string; objectKey: string; name: string; byteSize: number; mimeType: string; sha256: string }> = [];
    const uploaded: string[] = [];
    for (const [index, picture] of pictures.entries()) {
      if (assetBySha.has(picture.sha256)) continue;
      const id = randomUUID();
      const key = `${academyId}/${id}`;
      const { error } = await this.client.storage
        .from(bucket)
        .upload(key, picture.bytes, { contentType: picture.type.mime, upsert: false });
      if (error) continue;
      uploaded.push(key);
      assetBySha.set(picture.sha256, id);
      created.push({
        id, academyId, courseId, objectKey: key,
        name: remoteImageName(new URL(picture.href), picture.type.extension, index),
        byteSize: picture.bytes.length, mimeType: picture.type.mime, sha256: picture.sha256,
      });
    }
    if (created.length) {
      try {
        await this.db.manualAsset.createMany({ data: created });
      } catch (error) {
        await this.client.storage.from(bucket).remove(uploaded);
        throw error;
      }
    }
    const assetIdByUrl = new Map<string, string>();
    for (const picture of pictures) {
      const id = assetBySha.get(picture.sha256);
      if (id) assetIdByUrl.set(picture.href, id);
    }
    return {
      html: rewriteRemoteImages(html, assetIdByUrl),
      copied: [...assetIdByUrl.keys()],
      failed: [...failed, ...pictures.filter((p) => !assetIdByUrl.has(p.href)).map((p) => p.href)],
    };
  }

  /** A stored picture as a data URL (same-origin, so it displays under COEP), or null for any other asset. */
  async imageDataUrls(assetIds: readonly string[]): Promise<Record<string, string | null>> {
    const ids = [...new Set(assetIds)];
    if (!ids.length) return {};
    const rows = await this.db.manualAsset.findMany({ where: { id: { in: ids }, mimeType: { startsWith: "image/" } }, select: { id: true, mimeType: true, objectKey: true, byteSize: true, sha256: true } });
    const result: Record<string, string | null> = Object.fromEntries(ids.map(id => [id, null]));
    for (let offset = 0; offset < rows.length; offset += 4) {
      await Promise.all(rows.slice(offset, offset + 4).map(async row => {
        try { result[row.id] = `data:${row.mimeType};base64,${await this.download(row)}`; }
        catch { result[row.id] = null; }
      }));
    }
    return result;
  }
  async imageDataUrl(assetId: string): Promise<string | null> {
    const row = await this.db.manualAsset.findUnique({ where: { id: assetId } });
    if (!row?.mimeType.startsWith("image/")) return null;
    return `data:${row.mimeType};base64,${await this.download(row)}`;
  }
  async bytes(assetId: string) {
    return this.download(
      await this.db.manualAsset.findUniqueOrThrow({ where: { id: assetId } }),
    );
  }
  private async download(row: { objectKey: string; byteSize: number; sha256: string }) {
    const { data, error } = await this.client.storage
      .from(bucket)
      .download(row.objectKey);
    if (error || !data)
      throw new ServiceUnavailableException("Lesson asset is unavailable");
    const bytes = Buffer.from(await data.arrayBuffer());
    if (
      bytes.length !== row.byteSize ||
      createHash("sha256").update(bytes).digest("hex") !== row.sha256
    )
      throw new ServiceUnavailableException("Lesson asset verification failed");
    return bytes.toString("base64");
  }
}
