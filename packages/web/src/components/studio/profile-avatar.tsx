import { initialsOf, resolveAvatar, type AvatarSource } from '@cove/shared';

import { cn } from '@/lib/utils';

/**
 * A person, at whatever size the surface needs.
 *
 * The fallback chain lives in `@cove/shared` so the roster, the header, and
 * My Page cannot disagree about which picture is the right one. When nothing
 * has been uploaded anywhere the answer is the placeholder below — never an
 * empty frame, because an avatar-shaped hole reads as a page that failed to
 * load rather than as a person who has not chosen a photo.
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
      // `initials` is the *chain's* name for "nothing was uploaded"; what that
      // renders is this component's decision, so the attribute says what is
      // actually on screen. Tests and probes read it.
      data-avatar={resolved.kind === 'initials' ? 'placeholder' : resolved.kind}
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
        <PlaceholderPerson />
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

/**
 * The stand-in for a member who has not uploaded a photo.
 *
 * Inline SVG rather than an image file, for three reasons that all matter here.
 * It is drawn from the wrapper's own box, so one component serves every size
 * from the 32px roster disc to the 96px profile header without a set of raster
 * assets that are each wrong at three of the four. It costs no request, which
 * on a page of twenty-five members is twenty-five requests not made. And it
 * takes its colour from a token, so it recedes correctly on a dark page — a
 * fixed grey PNG would glow.
 *
 * Decorative by construction: the name is always written beside it, so the
 * figure is hidden from assistive technology rather than described twice.
 */
function PlaceholderPerson() {
  return (
    <svg
      aria-hidden
      className="absolute inset-0 h-full w-full fill-sub opacity-40"
      viewBox="0 0 40 40"

    >
      <circle cx="20" cy="13.2" r="7.2" />
      <path d="M20 22.6c-6.7 0-12.1 4.7-12.1 10.4 0 1.2 1 2.2 2.2 2.2h19.8c1.2 0 2.2-1 2.2-2.2 0-5.7-5.4-10.4-12.1-10.4Z" />
    </svg>
  );
}

/** Which image the fallback chain landed on, for surfaces that say so. */
export function avatarSourceOf(input: ProfileAvatarProps): AvatarSource {
  return resolveAvatar(input);
}

export { initialsOf };
