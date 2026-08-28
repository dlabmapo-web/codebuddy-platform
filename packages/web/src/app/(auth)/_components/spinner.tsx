/**
 * The one spinner the signed-out screens use.
 *
 * A ring rather than dots or a bar, and drawn in `currentColor` so it takes
 * the colour of whatever it sits in — brand blue on a card, `on-brand` inside
 * a filled button — without a variant for each.
 *
 * Distinct on purpose from the skeleton sweep in `globals.css`, which the rest
 * of the app uses. The two say different things and should not look alike: a
 * sweep stands in for content that is not here yet, and a spinner says the
 * action you just took is running. Sharing one gesture for both would make
 * "your click worked" and "this page is empty" read the same.
 *
 * `aria-hidden` throughout: the control around it carries `aria-busy` and a
 * label that already says what is happening, and a second announcement from
 * the graphic would say it twice.
 */
export function Spinner({
  className,
  size = 20,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      aria-hidden
      className={className ? `cove-spinner ${className}` : 'cove-spinner'}
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.5"
      />
    </svg>
  );
}
