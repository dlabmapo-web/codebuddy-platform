import { createReadStream } from "node:fs";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient } from "@supabase/supabase-js";
import { pdfSignedUrlSeconds } from "@cove/shared";
import { AppException } from "../common/app-exception.js";
import type { ApiEnvironment } from "../config/env.schema.js";
export const pdfBucket = "course-documents";

@Injectable()
export class PdfStorageService {
  private readonly client;
  private readonly endpoint: string;
  private readonly secret: string;
  constructor(config: ConfigService<ApiEnvironment, true>) {
    this.endpoint = config.get("SUPABASE_URL", { infer: true });
    this.secret = config.get("SUPABASE_SECRET_KEY", { infer: true });
    this.client = createClient(this.endpoint, this.secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  async upload(key: string, path: string, byteSize: number) {
    const stream = createReadStream(path);
    try {
      const response = await fetch(
        `${this.endpoint}/storage/v1/object/${pdfBucket}/${key}`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.secret}`,
            apikey: this.secret,
            "content-type": "application/pdf",
            "content-length": String(byteSize),
            "x-upsert": "false",
            "cache-control": "max-age=300",
          },
          body: stream,
          duplex: "half",
          signal: AbortSignal.timeout(120_000),
        } as unknown as RequestInit,
      );
      if (!response.ok) throw new Error();
    } catch {
      throw new AppException("PDF_STORAGE_FAILED", 502);
    } finally {
      stream.destroy();
    }
  }
  async sign(key: string, download?: string) {
    const { data, error } = await this.client.storage
      .from(pdfBucket)
      .createSignedUrl(
        key,
        pdfSignedUrlSeconds,
        download ? { download } : undefined,
      );
    if (error || !data) throw new AppException("PDF_STORAGE_FAILED", 502);
    return data.signedUrl;
  }
  async remove(key: string) {
    const { error } = await this.client.storage.from(pdfBucket).remove([key]);
    return !error;
  }
}
