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
const bucket = "turtle-assets";
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
      if (size > 5242880) throw new BadRequestException("Asset exceeds 5 MiB");
      parts.push(Buffer.from(chunk));
    }
    const bytes = Buffer.concat(parts);
    if (!size) throw new BadRequestException("Empty asset");
    let mime = "";
    const extension = name.split(".").pop()?.toLowerCase();
    if (
      extension === "gif" &&
      ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString())
    )
      mime = "image/gif";
    else if (
      extension === "png" &&
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    )
      mime = "image/png";
    else if (
      extension === "jpg" &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255
    )
      mime = "image/jpeg";
    else if (["txt", "csv", "json"].includes(extension ?? "")) {
      try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        if (text.includes("\0")) throw new Error();
        if (extension === "json") JSON.parse(text);
        mime = extension === "json" ? "application/json" : "text/plain";
      } catch {
        throw new BadRequestException("Invalid data file");
      }
    }
    if (!mime)
      throw new BadRequestException(
        "Use GIF, PNG, JPG, UTF-8 TXT, CSV or JSON data",
      );
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
  async bytes(assetId: string) {
    const row = await this.db.manualAsset.findUniqueOrThrow({
      where: { id: assetId },
    });
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
