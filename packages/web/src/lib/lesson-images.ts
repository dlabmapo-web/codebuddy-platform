/**
 * Private lesson pictures: preparing what an author picks from their own
 * computer, and showing `cove-asset:` images to whoever may read them.
 */

/** The stored-name rule the manual schema and the Turtle runtime enforce. */
const safeName = /^[a-zA-Z0-9_-][a-zA-Z0-9_. -]{0,100}$/;
/** Per-file limit the lesson-asset store, manual schema and Turtle runtime share. */
export const lessonImageMaxBytes = 5 * 1024 * 1024;
const extensions: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp',
  'image/avif': 'avif', 'image/bmp': 'bmp', 'image/svg+xml': 'svg',
};
/** Still pictures the browser can redraw smaller; GIF and SVG would lose animation or vectors. */
const redrawable = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/bmp']);

/** Why an image cannot be uploaded; the editor shows a translated message for each. */
export class LessonImageError extends Error {
  constructor(readonly reason: 'too-large' | 'too-large-unshrinkable') { super(reason); }
}

/**
 * A stored name for a picked file. A valid name is kept, because Turtle
 * programs open their assets by name; any other (a Korean screenshot, say)
 * becomes a safe, unique one with the same extension.
 */
export function lessonAssetName(name: string, type: string): string {
  if (safeName.test(name)) return name;
  const dot = name.lastIndexOf('.');
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize('NFKD').replace(/[^a-zA-Z0-9_.]+/g, '-')
    .replace(/^[-. ]+|[-. ]+$/g, '').slice(0, 60);
  const suffix = crypto.randomUUID().slice(0, 6);
  return `${/^[a-zA-Z0-9_-]/.test(base) ? base : base ? `image-${base}` : 'image'}-${suffix}.${/^[a-z0-9]{1,5}$/.test(extension) ? extension : extensions[type] ?? 'png'}`;
}

function withExtension(name: string, extension: string) {
  return name.replace(/\.[^.]*$/, '') + '.' + extension;
}

async function redraw(file: File, longest: number, type: string): Promise<Blob | null> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, longest / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.85));
}

/**
 * The file to upload for a picked image: unchanged when it fits, otherwise a
 * still picture redrawn at most 2560 px (then 1600 px) on its longest side,
 * as WebP where the browser can encode it and JPEG where it cannot.
 */
export async function prepareLessonImage(file: File): Promise<File> {
  const name = lessonAssetName(file.name, file.type);
  if (file.size <= lessonImageMaxBytes) return name === file.name ? file : new File([file], name, { type: file.type });
  if (!redrawable.has(file.type)) throw new LessonImageError('too-large-unshrinkable');
  for (const longest of [2560, 1600]) {
    for (const type of ['image/webp', 'image/jpeg']) {
      const blob = await redraw(file, longest, type);
      // A browser that cannot encode the type falls back to PNG; try the next.
      if (blob && blob.type === type && blob.size <= lessonImageMaxBytes)
        return new File([blob], withExtension(name, extensions[type]!), { type });
    }
  }
  throw new LessonImageError('too-large');
}

const reference = /^cove-asset:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const imageTag = /<img\b[^>]*>/gi;
const imageSource = /\bsrc\s*=\s*(["'])(cove-asset:[^"']*)\1/i;

/** The private images an HTML statement shows, each once. */
export function privateImageIds(html: string): string[] {
  const ids = new Set<string>();
  for (const [tag] of html.matchAll(imageTag)) {
    const id = tag.match(imageSource)?.[2]?.match(reference)?.[1];
    if (id) ids.add(id.toLowerCase());
  }
  return [...ids];
}

const escape = (text: string) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * The statement with its private images swapped for what was resolved: a URL
 * shows the picture, `undefined` (still loading) shows nothing yet, and `null`
 * (not readable) leaves the alt text in a neutral box, never a broken icon or
 * a request for an unknown scheme.
 */
export function withPrivateImages(html: string, urls: ReadonlyMap<string, string | null>): string {
  return html.replace(imageTag, (tag) => {
    const source = tag.match(imageSource);
    const id = source?.[2]?.match(reference)?.[1]?.toLowerCase();
    if (!source || !id) return tag;
    const url = urls.get(id);
    if (url) return tag.replace(imageSource, `src="${escape(url)}"`);
    if (url === null) {
      // The attribute text is already entity-encoded; only markup must not survive.
      const alt = (tag.match(/\balt\s*=\s*(["'])(.*?)\1/i)?.[2] ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<span class="cove-image-missing">${alt}</span>`;
    }
    return tag.replace(imageSource, '');
  });
}

/**
 * A resolver for `PrivateImageContext` that asks the server once per image
 * and page. A failed read is forgotten, so a later render can try again.
 */
export function cachedImageResolver(read: (assetId: string) => Promise<string>) {
  const cache = new Map<string, Promise<string>>();
  return (src: string) => {
    const id = src.match(reference)?.[1]?.toLowerCase();
    if (!id) return Promise.reject(new Error('Not a lesson image'));
    let pending = cache.get(id);
    if (!pending) {
      pending = read(id).catch((error: unknown) => { cache.delete(id); throw error; });
      cache.set(id, pending);
    }
    return pending;
  };
}
