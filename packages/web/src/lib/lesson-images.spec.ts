// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { cachedImageResolver, lessonAssetName, LessonImageError, prepareLessonImage, privateImageIds, withPrivateImages } from './lesson-images';

const id = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const safe = /^[a-zA-Z0-9_-][a-zA-Z0-9_. -]{0,100}$/;
const fileOf = (bytes: number, name: string, type: string) => new File([new Uint8Array(bytes)], name, { type });

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('lessonAssetName', () => {
  it('keeps a name Turtle programs can already open', () => {
    expect(lessonAssetName('turtle shape_1.gif', 'image/gif')).toBe('turtle shape_1.gif');
  });

  it('makes a Korean screenshot name safe, unique and keeps its extension', () => {
    const name = lessonAssetName('스크린샷 2026-11-06 오후 4.09.06.png', 'image/png');
    expect(name).toMatch(/^2026-11-06-4\.09\.06-[0-9a-f]{6}\.png$/);
    expect(name).toMatch(safe);
    expect(lessonAssetName('스크린샷.png', 'image/png')).not.toBe(lessonAssetName('스크린샷.png', 'image/png'));
  });

  it('falls back to a plain name and the type when nothing usable is left', () => {
    expect(lessonAssetName('사진', 'image/jpeg')).toMatch(/^image-[0-9a-f]{6}\.jpg$/);
    expect(lessonAssetName('.hidden.webp', 'image/webp')).toMatch(safe);
  });
});

describe('prepareLessonImage', () => {
  it('uploads a picture that fits byte for byte, renaming it only when needed', async () => {
    const fits = fileOf(1024, 'diagram.png', 'image/png');
    expect(await prepareLessonImage(fits)).toBe(fits);
    const renamed = await prepareLessonImage(fileOf(1024, '그림.png', 'image/png'));
    expect(renamed.name).toMatch(/^image-[0-9a-f]{6}\.png$/);
    expect(renamed.size).toBe(1024);
  });

  it('refuses a GIF or SVG over 5 MB instead of flattening it', async () => {
    await expect(prepareLessonImage(fileOf(6 * 1024 * 1024, 'moving.gif', 'image/gif'))).rejects.toMatchObject({ reason: 'too-large-unshrinkable' });
    await expect(prepareLessonImage(fileOf(6 * 1024 * 1024, 'big.svg', 'image/svg+xml'))).rejects.toBeInstanceOf(LessonImageError);
  });

  it('redraws a large photo at most 2560 px wide as WebP', async () => {
    const drawImage = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 6000, height: 4000, close: vi.fn() })));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, done: BlobCallback, type?: string) {
      done(new Blob([new Uint8Array(900_000)], { type }));
    });
    const prepared = await prepareLessonImage(fileOf(12 * 1024 * 1024, 'IMG_2041.JPG', 'image/jpeg'));
    expect(prepared).toMatchObject({ name: 'IMG_2041.webp', type: 'image/webp', size: 900_000 });
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 2560, 1707);
  });

  it('uses JPEG where the browser cannot encode WebP, and gives up when nothing fits', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 4000, height: 3000, close: vi.fn() })));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as never);
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, done: BlobCallback, type?: string) {
      done(new Blob([new Uint8Array(1000)], { type: type === 'image/webp' ? 'image/png' : type }));
    });
    expect(await prepareLessonImage(fileOf(8 * 1024 * 1024, 'photo.png', 'image/png'))).toMatchObject({ name: 'photo.jpg', type: 'image/jpeg' });

    toBlob.mockImplementation(function (this: HTMLCanvasElement, done: BlobCallback, type?: string) {
      done(new Blob([new Uint8Array(6 * 1024 * 1024)], { type }));
    });
    await expect(prepareLessonImage(fileOf(8 * 1024 * 1024, 'photo.png', 'image/png'))).rejects.toMatchObject({ reason: 'too-large' });
  });
});

describe('private images in statements', () => {
  const html = `<p>Map</p><img src="cove-asset:${id}" alt="map.png" width="320"><img src='cove-asset:${other.toUpperCase()}' alt="x<y"><img src="https://example.com/a.png">`;

  it('finds each private image once', () => {
    expect(privateImageIds(`${html}<img src="cove-asset:${id}">`)).toEqual([id, other]);
    expect(privateImageIds('<p>cove-asset:' + id + '</p>')).toEqual([]);
  });

  it('shows resolved pictures, nothing while loading, and the alt text when unreadable', () => {
    const resolved = withPrivateImages(html, new Map([[id, 'data:image/png;base64,AAAA'], [other, null]]));
    expect(resolved).toContain('<img src="data:image/png;base64,AAAA" alt="map.png" width="320">');
    expect(resolved).toContain('<span class="cove-image-missing">x&lt;y</span>');
    expect(resolved).toContain('src="https://example.com/a.png"');
    expect(withPrivateImages(html, new Map())).not.toContain('cove-asset:');
  });

  it('asks the server once per image and retries one that failed', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue('data:image/png;base64,AAAA');
    const resolve = cachedImageResolver(read);
    await expect(resolve(`cove-asset:${id}`)).rejects.toThrow('offline');
    await expect(resolve(`cove-asset:${id.toUpperCase()}`)).resolves.toBe('data:image/png;base64,AAAA');
    await resolve(`cove-asset:${id}`);
    expect(read).toHaveBeenCalledTimes(2);
    await expect(resolve('https://example.com/a.png')).rejects.toThrow();
  });
});
