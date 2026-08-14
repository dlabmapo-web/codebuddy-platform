import { initialsOf, resolveAvatar, type AvatarSource } from '@cove/shared';

import { cn } from '@/lib/utils';

/**
 * A person, at whatever size the surface needs.
 *
 * The fallback chain lives in `@cove/shared` so the roster, the header, and
 * My Page cannot disagree about which picture is the right one. When nothing
 * has been uploaded anywhere, initials are the answer — never an empty frame,
 * because a row nobody can identify is a row nobody can act on.
 */
export type ProfileAvatarProps = {
  academyImageUrl?: string | null;
  globalImageUrl?: string | null;
  externalAvatarUrl?: string | null;
  name?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /**
   * Screen-reader text. Left empty when the name is already written beside the
   * image, so a reader does not hear it twice.
   */
  alt?: string;
  className?: string;
};

const sizes = {
  sm: { pixels: 32, text: 'text-[12px]' },
  md: { pixels: 40, text: 'text-[14px]' },
  lg: { pixels: 64, text: 'text-[22px]' },
  xl: { pixels: 96, text: 'text-[32px]' },
} as const;

export function ProfileAvatar({
  size = 'md',
  alt = '',
  className,
  ...source
}: ProfileAvatarProps) {
  const resolved = resolveAvatar(source);
  const dimensions = sizes[size];
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent font-extrabold tracking-[-0.02em] text-sub',
        dimensions.text,
        className,
      )}
      data-avatar={resolved.kind}
      // Explicit physical dimensions avoid Safari's cyclic percentage sizing:
      // an image's intrinsic dimensions must never be allowed to size its
      // avatar wrapper.
      style={{
        width: dimensions.pixels,
        height: dimensions.pixels,
        minWidth: dimensions.pixels,
        minHeight: dimensions.pixels,
      }}
    >
      {resolved.kind === 'initials' ? (
        <span aria-hidden>{resolved.initials}</span>
      ) : (
        // Signed URLs and external OAuth photos both point off-origin and
        // expire, so the optimizer would cache a URL that stops resolving.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={alt}
          className="absolute inset-0 block h-full w-full object-cover"
          // This app uses COEP `require-corp` for Pyodide. Supabase Storage
          // permits CORS, but browsers only use it for an explicit CORS image.
          crossOrigin="anonymous"
          src={resolved.url}
        />
      )}
    </span>
  );
}

/** Which image the fallback chain landed on, for surfaces that say so. */
export function avatarSourceOf(input: ProfileAvatarProps): AvatarSource {
  return resolveAvatar(input);
}

export { initialsOf };
