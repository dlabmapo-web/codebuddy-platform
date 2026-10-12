import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient } from "@supabase/supabase-js";
import { createReadStream } from "node:fs";
export const videoBucket = "course-videos";
@Injectable()
export class VideoStorage {
  readonly client;
  readonly endpoint: string;
  private readonly secret: string;
  constructor(config: ConfigService) {
    this.endpoint = config.getOrThrow("SUPABASE_URL");
    this.secret = config.getOrThrow("SUPABASE_SECRET_KEY");
    this.client = createClient(this.endpoint, this.secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  async grant(key: string) {
    const { data, error } = await this.client.storage
      .from(videoBucket)
      .createSignedUploadUrl(key, { upsert: false });
    if (error || !data) throw new Error("Video upload storage unavailable");
    return {
      token: data.token,
      endpoint:
        this.endpoint.replace(/\.supabase\.co$/, ".storage.supabase.co") +
        "/storage/v1/upload/resumable",
      bucket: videoBucket,
      objectName: key,
    };
  }
  async info(key: string): Promise<{ size?: number }> {
    const { data, error } = await this.client.storage
      .from(videoBucket)
      .info(key);
    if (error || !data) throw new Error("Upload is not finished");
    return { size: data.size };
  }
  async get(
    key: string,
    range?: string,
    signal?: AbortSignal,
    bucket = videoBucket,
  ) {
    return fetch(
      `${this.endpoint}/storage/v1/object/authenticated/${bucket}/${key}`,
      {
        headers: {
          "Accept-Encoding": "identity",
          authorization: `Bearer ${this.secret}`,
          apikey: this.secret,
          ...(range ? { range } : {}),
        },
        signal,
      },
    );
  }
  async put(
    key: string,
    body: string | Buffer | { path: string; size: number },
    mime: string,
  ) {
    if (typeof body === "string" || Buffer.isBuffer(body)) {
      const { error } = await this.client.storage
        .from(videoBucket)
        .upload(key, body, { contentType: mime, upsert: false });
      if (error) throw new Error("Media storage failed");
      return;
    }
    const stream = createReadStream(body.path);
    try {
      const response = await fetch(
        `${this.endpoint}/storage/v1/object/${videoBucket}/${key}`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.secret}`,
            apikey: this.secret,
            "content-type": mime,
            "content-length": String(body.size),
          },
          body: stream,
          duplex: "half",
          signal: AbortSignal.timeout(300000),
        } as unknown as RequestInit,
      );
      if (!response.ok) throw new Error("Media storage failed");
    } finally {
      stream.destroy();
    }
  }
  // Only call after the database marks an unreferenced asset DELETING.
  // Listing its complete namespace also catches a crashed attempt's partial outputs.
  async removeAssetPrefix(academyId: string, assetId: string) {
    if (![academyId, assetId].every((id) => /^[0-9a-f-]{36}$/.test(id)))
      throw new Error("Invalid video cleanup scope");
    const bucket = this.client.storage.from(videoBucket);
    async function collect(prefix: string): Promise<string[]> {
      const keys: string[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await bucket.list(prefix, {
          limit: 1000,
          offset,
          sortBy: { column: "name", order: "asc" },
        });
        if (error || !data) throw new Error("Media cleanup listing failed");
        for (const item of data) {
          const key = `${prefix}/${item.name}`;
          if (item.id) keys.push(key);
          else keys.push(...(await collect(key)));
        }
        if (data.length < 1000) break;
      }
      return keys;
    }
    const keys = await collect(`${academyId}/${assetId}`);
    for (let start = 0; start < keys.length; start += 100)
      await this.remove(keys.slice(start, start + 100));
  }
  async remove(keys: string[]) {
    const { error } = await this.client.storage.from(videoBucket).remove(keys);
    if (error) throw new Error("Media deletion failed");
  }
}
