import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createClient } from "@supabase/supabase-js";
import { PrismaService } from "../database/prisma.service.js";
import { assetRefsOf } from "./asset-retention.js";
import type { CanonicalValue } from "./canonical.js";
/** Called only with values obtained through an authorized academy conflict. */
@Injectable()
export class LibraryReviewPreviews {
    constructor(private readonly config: ConfigService, private readonly prisma: PrismaService) { }
    private async sign(bucket: string, keys: string[]): Promise<Map<string, string>> {
        if (!keys.length)
            return new Map();
        const client = createClient(this.config.getOrThrow('SUPABASE_URL'), this.config.getOrThrow('SUPABASE_SECRET_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
        // Preview failure must not prevent an editor preserving their content.
        const { data, error } = await client.storage.from(bucket).createSignedUrls([...new Set(keys)], 300);
        if (error || !data)
            return new Map();
        return new Map(data.filter(row => row.path && row.signedUrl).map(row => [row.path!, row.signedUrl!]));
    }
    async media(rows: Array<{
        id: string;
        kind: string;
        objectKey: string | null;
    }>, values: Array<CanonicalValue | undefined> = []) {
        const captions = values.flatMap(value => {
            if (!value || typeof value !== 'object' || Array.isArray(value))
                return [];
            const item = value as Record<string, unknown>;
            const row = rows.find(row => row.kind === 'VIDEO' && row.id === item.assetId && row.objectKey);
            if (!row || !Array.isArray(item.captions))
                return [];
            return item.captions.flatMap(caption => {
                const path = caption?.path;
                if (typeof path !== 'string' || !/^[a-zA-Z0-9_./-]+\.vtt$/.test(path) || path.includes('..') || path.startsWith('/'))
                    return [];
                return [{ id: row.id, path, key: row.objectKey!.split('/').slice(0, 2).join('/') + '/' + path }];
            });
        });
        const [pdf, video] = await Promise.all([
            this.sign('course-documents', rows.filter(row => row.kind === 'PDF' && row.objectKey).map(row => row.objectKey!)),
            this.sign('course-videos', [...rows.filter(row => row.kind === 'VIDEO' && row.objectKey).map(row => row.objectKey!), ...captions.map(caption => caption.key)]),
        ]);
        return new Map(rows.map(row => [row.id, {
                previewUrl: row.objectKey ? (row.kind === 'PDF' ? pdf : video).get(row.objectKey) ?? null : null,
                captionUrls: Object.fromEntries(captions.filter(caption => caption.id === row.id && video.has(caption.key)).map(caption => [caption.path, video.get(caption.key)!])),
            }]));
    }
    async images(values: CanonicalValue[]): Promise<Record<string, string>> {
        const ids = [...new Set(values.flatMap(value => assetRefsOf('', value)).filter(ref => ref.kind === 'LESSON_IMAGE').map(ref => ref.assetId))];
        if (!ids.length)
            return {};
        const rows = await this.prisma.manualAsset.findMany({ where: { id: { in: ids }, mimeType: { startsWith: 'image/' } }, select: { id: true, objectKey: true } });
        const urls = await this.sign('turtle-assets', rows.map(row => row.objectKey));
        return Object.fromEntries(rows.flatMap(row => urls.has(row.objectKey) ? [[`cove-asset:${row.id}`, urls.get(row.objectKey)!]] : []));
    }
}
