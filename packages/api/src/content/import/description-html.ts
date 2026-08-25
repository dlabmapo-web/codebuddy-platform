import { renderPlainTextDescription } from "@cove/shared";

/**
 * Problem descriptions, made safe to store.
 *
 * §5.4 says untrusted workbook HTML is never stored without sanitization, and
 * that sentence is doing more work than it looks like. A description is
 * rendered into the student's exercise page, the teacher's monitoring view, and
 * the team lead's preview; a `<script>` that survived import would run in all
 * three, under the reader's session, in an academy the workbook's author may
 * not belong to.
 *
 * The approach is an allowlist and a rewrite, never a blocklist and a filter.
 * Stripping `<script>` from a string leaves `<img onerror=...>`, `<a
 * href="javascript:...">`, `<svg>`, `<style>`, and a dozen more; every
 * blocklist sanitizer that has ever shipped has been bypassed. This one
 * discards everything and re-emits only the tags and attributes on the list,
 * which fails closed: a tag nobody thought about is dropped because it was
 * never named, not because somebody remembered it was dangerous.
 *
 * A hand-written sanitizer rather than a library is a deliberate trade, and the
 * same one `workbook-reader.ts` makes. The vocabulary a problem description
 * needs is a dozen tags with no attributes worth keeping, and the whole surface
 * is on this page.
 */

/**
 * The tags a problem description may use.
 *
 * The Rich Editor's own vocabulary and nothing beyond it. `pre` and `code` are
 * here because Python problems are mostly examples; tables are not, because the
 * editor cannot produce one and a description that needs one is a description
 * that should be an image nobody can import yet.
 */
const allowedTags = new Set([
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "code",
  "pre",
  "ul",
  "ol",
  "li",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
]);

/**
 * Tags whose *content* goes with them.
 *
 * Dropping the tag but keeping the text is right for a `<div>` — the words were
 * meant to be read. It is wrong for `<script>` and `<style>`, whose bodies are
 * code that would land in the page as visible text at best and, for `<style>`,
 * be re-interpreted by a downstream renderer at worst.
 */
const voidedTags = new Set(["script", "style", "iframe", "object", "embed"]);

/**
 * Workbook HTML, reduced to the allowlist.
 *
 * No attributes survive at all. §5.4's format is a description, not a document:
 * there is no class to preserve, no id worth keeping, and no `href` that is not
 * a way to smuggle `javascript:` past a check somebody will get subtly wrong.
 * Links in a problem statement are a feature nobody has asked for, and adding
 * one later means adding a URL scheme check deliberately rather than inheriting
 * a hole.
 */
export function sanitizeDescriptionHtml(input: string): string {
  const withoutVoided = stripVoidedElements(input);

  const rewritten = withoutVoided.replace(
    /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g,
    (match, rawName: string) => {
      const name = rawName.toLowerCase();
      if (!allowedTags.has(name)) return "";
      // `br` is void; everything else keeps whichever end of the pair it was.
      if (name === "br") return "<br>";
      return match.startsWith("</") ? `</${name}>` : `<${name}>`;
    },
  );

  // Comments can carry a conditional that some renderers act on, and they
  // cannot say anything a description needs to say.
  const withoutComments = rewritten.replace(/<!--[\s\S]*?-->/g, "");

  return normalizeEmptyDescription(withoutComments);
}

/**
 * Elements removed with their bodies.
 *
 * An unclosed `<script>` swallows the rest of the string, which is the
 * conservative direction to fail in: a description that loses its tail is a
 * visible problem a team lead reports, and one that keeps a live script is not.
 */
function stripVoidedElements(input: string): string {
  let output = input;
  for (const tag of voidedTags) {
    output = output.replace(
      new RegExp(`<${tag}\\b[\\s\\S]*?(?:</${tag}\\s*>|$)`, "gi"),
      "",
    );
  }
  return output;
}

/**
 * §5.4 — the empty-content normalization manual authoring already applies.
 *
 * A Rich Editor that has been typed into and cleared emits `<p></p>`, and a
 * description that renders as one blank paragraph should compare equal to one
 * that is genuinely absent. Without this, clearing a description in Excel and
 * clearing it in the editor produce two different stored values, and a round
 * trip reports an update where nothing changed.
 */
export function normalizeEmptyDescription(html: string): string {
  const withoutMarkup = html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ");
  return withoutMarkup.trim().length === 0 ? "" : html;
}

/**
 * The resolver the planner is handed.
 *
 * Both formats end up as the same kind of value — safe HTML in the Rich
 * Editor's vocabulary — which is what lets the planner compare a workbook
 * description against a stored one with `===`. §5.4's round-trip guarantee
 * depends on it: a current-course export writes `RICH_TEXT_HTML` carrying the
 * stored string, and re-importing it has to produce that same string.
 */
export function resolveWorkbookDescription(input: {
  text: string;
  format: "PLAIN_TEXT" | "RICH_TEXT_HTML";
}): string {
  if (input.text.trim().length === 0) return "";
  return input.format === "PLAIN_TEXT"
    ? normalizeEmptyDescription(renderPlainTextDescription(input.text))
    : sanitizeDescriptionHtml(input.text);
}
