/**
 * Stored rich text predates the cross-origin isolation policy, so existing
 * image markup may not carry `crossorigin`. Tiptap owns this HTML and emits
 * ordinary `<img ...>` tags, which lets us upgrade it at the render boundary
 * without migrating persisted course content.
 */
export function withAnonymousImageCors(content: string): string {
  return content.replace(
    /<img\b(?![^>]*\bcrossorigin\s*=)([^>]*)>/gi,
    '<img crossorigin="anonymous"$1>',
  );
}
