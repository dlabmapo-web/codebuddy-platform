import type { ReactNode } from "react";

/**
 * A translated string, rendered with the two things a copywriter can say about
 * it: where a line ends, and which words carry weight.
 *
 * The marketing copy is reviewed by the client in Korean, on a printout, with
 * a marker. Half of what comes back is not wording at all — it is "break this
 * heading after the comma", "these two sentences are separate stanzas", "bold
 * 3분". A bare `{t("about.body")}` cannot express any of it: a `\n` in the JSON
 * reaches the DOM and CSS collapses it like any other whitespace, and emphasis
 * needs an element that a `t()` return value cannot be.
 *
 * So exactly two markers, and no more:
 *
 *   `\n`         a line break the copywriter chose
 *   `**word**`   a run of emphasis
 *
 * `whitespace-pre-line` rather than `<br />`, because a `<br />` is
 * unconditional: it would hold the client's three-line paragraph at three
 * lines on a phone, with two of them overflowing. `pre-line` honours the
 * chosen break *and* still wraps naturally when the column is narrower than
 * the line, and it renders a `\n\n` as the blank line between stanzas with no
 * special case of its own.
 *
 * `<strong>` sets weight and nothing else. The same string appears on paper in
 * `text-sub`, on the deep band in `text-white/60`, and on a photo tile in
 * `text-white/75`; a colour here would put ink on navy the first time someone
 * bolds a word in the Cove Studio section.
 *
 * Strings carrying neither marker — most of them — render exactly as they did
 * before, which is what makes this safe to apply to every section at once
 * rather than to the eleven strings we happened to remember.
 */
export function RichText({ children }: { children: string }): ReactNode {
  return (
    <span className="whitespace-pre-line">
      {children.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={index} className="font-semibold">
            {part.slice(2, -2)}
          </strong>
        ) : (
          part
        ),
      )}
    </span>
  );
}
