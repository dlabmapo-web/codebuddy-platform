import { Spinner } from './spinner';

/**
 * The whole page, held while a signed-out form is submitting.
 *
 * A page-level state rather than a mark on the button, because that is what is
 * actually true: signing in is not one control doing something, it is this
 * screen on its way to being replaced. A 20px ring inside a button asks
 * somebody to notice a detail; a quiet page with one ring in the middle of it
 * says the same thing without being looked for.
 *
 * It also covers the part of the wait the button never could. A correct
 * sign-in ends in a redirect, so the form is not answered — it is replaced —
 * and the seconds between the two belong to neither page. This spans them, and
 * the destination's own `loading.tsx` picks up where it leaves off.
 *
 * `bg-canvas/85` with a blur rather than a dark scrim: the auth screens are a
 * blue panel beside a white card, and a black wash over that reads as a modal
 * asking a question. This reads as the page itself going quiet, which is what
 * is happening.
 *
 * `aria-hidden` on all of it, deliberately. The submit button holds focus,
 * carries `aria-busy`, and has already swapped its label to the verb in
 * progress — that is the announcement, and a live region repeating it here
 * would say one thing twice. This layer is for the eyes.
 */
export function AuthBusyOverlay({ label }: { label: string }) {
  return (
    <div
      aria-hidden
      className="cove-busy-overlay fixed inset-0 z-50 grid place-items-center bg-canvas/85 backdrop-blur-sm"
    >
      <div className="flex flex-col items-center gap-4">
        <Spinner className="text-brand" size={44} />
        <p className="text-[15px] font-semibold text-sub">{label}</p>
      </div>
    </div>
  );
}
