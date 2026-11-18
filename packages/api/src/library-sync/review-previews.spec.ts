import { beforeEach, expect, it, vi } from "vitest";
import { ConfigService } from "@nestjs/config";
import type { PrismaService } from "../database/prisma.service.js";
import { LibraryReviewPreviews } from "./review-previews.service.js";

const sign = vi.hoisted(() => vi.fn());
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ storage: {
  from: (bucket: string) => ({ createSignedUrls: (paths: string[]) => sign(bucket, paths) }),
} }) }));
beforeEach(() => {
  sign.mockReset().mockImplementation(async (_bucket: string, paths: string[]) => ({
    data: paths.map(path => ({ path, signedUrl: `https://storage.example/${path}?signed=short-lived` })), error: null,
  }));
});
function service(rows: unknown[] = []) {
  const db = { manualAsset: { findMany: vi.fn().mockResolvedValue(rows) } };
  return { db, preview: new LibraryReviewPreviews(new ConfigService({ SUPABASE_URL: 'https://storage.example', SUPABASE_SECRET_KEY: 'fixture-only' }), db as unknown as PrismaService) };
}
it('previews the actual immutable video output and caption paths, never a guessed playback location', async () => {
  const { preview } = service();
  const result = await preview.media([
    { id: 'pdf', kind: 'PDF', objectKey: 'pdf/retained.pdf' },
    { id: 'video', kind: 'VIDEO', objectKey: 'academy/video/encoded/lease/playback.mp4' },
  ], [{ assetId: 'video', captions: [
    { language: 'en', path: 'captions/old-track.vtt' },
    { language: 'ko', path: '../unrelated.vtt' },
  ] }]);
  expect(sign).toHaveBeenCalledWith('course-videos', ['academy/video/encoded/lease/playback.mp4', 'academy/video/captions/old-track.vtt']);
  expect(result.get('video')?.captionUrls).toHaveProperty('captions/old-track.vtt');
  expect(result.get('pdf')?.previewUrl).toContain('pdf/retained.pdf');
});
it('only resolves images referenced by the authorized comparison values', async () => {
  const assetId = '20000000-0000-4000-8000-000000000001';
  const { preview, db } = service([{ id: assetId, objectKey: 'academy/retained-image.png' }]);
  const urls = await preview.images([`<p>Explanation<img src="cove-asset:${assetId}" /></p>`]);
  expect(db.manualAsset.findMany).toHaveBeenCalledWith({ where: { id: { in: [assetId] }, mimeType: { startsWith: 'image/' } }, select: { id: true, objectKey: true } });
  expect(Object.keys(urls)).toEqual([`cove-asset:${assetId}`]);
});
it('a storage failure leaves metadata available without inventing a preview URL', async () => {
  sign.mockResolvedValue({ data: null, error: new Error('storage unavailable') });
  const { preview } = service();
  expect((await preview.media([{ id: 'pdf', kind: 'PDF', objectKey: 'retained.pdf' }])).get('pdf')?.previewUrl).toBeNull();
});
