import { CONTENT_IMPORT_MAX_KEY_LENGTH } from "./limits.js";

/**
 * Stable keys: what makes a re-upload an update instead of a duplicate.
 *
 * The v1 importer matched hierarchy records by title and row position, which is
 * why re-running it produced duplicates and order conflicts. §5.2 replaces both
 * with an author-chosen identifier that survives renaming, reordering, and
 * translation — the row can say something completely different next month and
 * still be the same problem.
 *
 * Normalization is the whole contract. `var-001`, `VAR-001`, and a `VAR-001`
 * pasted from a Korean IME with fullwidth digits are one key, because a Team
 * Lead editing a spreadsheet has no way to know which of those they typed. Two
 * keys that normalize to the same value are a conflict rather than a merge:
 * agreeing that they are the same is not the same as agreeing which row wins.
 *
 * See §5.2 of the team lead Excel problem import design.
 */

/**
 * A key, reduced to the one form that is stored and compared.
 *
 * NFKC first, so the fullwidth `ＶＡＲ` a CJK keyboard produces folds onto the
 * ASCII one before anything else looks at it. Then trim, then uppercase.
 *
 * `toUpperCase` rather than `toLocaleUpperCase` is deliberate and load-bearing:
 * in Turkish locales the latter maps `i` to `İ`, so a Turkish Team Lead and an
 * English one would disagree about whether `list-01` and `LIST-01` are the same
 * problem. Import identity cannot depend on where the browser thinks it is.
 */
export function normalizeStableKey(value: string): string {
  return value.normalize("NFKC").trim().toUpperCase();
}

/**
 * §5.2 — Unicode letters and numbers, plus the three ASCII punctuation marks a
 * key benefits from.
 *
 * Spaces and path separators are excluded on purpose. A key is echoed into
 * generated filenames, CSV issue reports, and URLs, and every one of those has
 * a different opinion about what a space or a slash means. Letting Hangul and
 * accented letters through costs nothing — they are identifiers, not paths.
 */
const stableKeyPattern = new RegExp(
  `^[\\p{L}\\p{N}_.-]{1,${CONTENT_IMPORT_MAX_KEY_LENGTH}}$`,
  "u",
);

export function isValidStableKey(normalized: string): boolean {
  return stableKeyPattern.test(normalized);
}

/**
 * Normalize and validate in one step, because every caller wants both.
 *
 * Returns null rather than throwing: an invalid key is a row issue the preview
 * reports beside its sheet and row number, not an exception that abandons the
 * other 199 problems in the workbook.
 */
export function parseStableKey(value: string): string | null {
  const normalized = normalizeStableKey(value);
  return isValidStableKey(normalized) ? normalized : null;
}

/**
 * The server-generated key manual authoring uses.
 *
 * Manually created modules, lectures, and problems need a key too — §5.2 says
 * the generated workbook exposes them so Excel can update content that was made
 * by hand. A UUID with the dashes kept is already valid under the pattern above
 * and already normalized, which is what makes "export it and import it back"
 * work without a translation table.
 */
export function stableKeyFromUuid(uuid: string): string {
  return normalizeStableKey(uuid);
}

/**
 * A title, reduced to something comparable for §5.2's title-collision rule.
 *
 * Case and whitespace only. Two problems called "Swap values" and "swap  values"
 * under different keys are a conflict the Team Lead has to resolve, because the
 * importer refusing to guess which one they meant is the entire point — but
 * `Swap Values` typed with a stray double space is not a second title, and
 * reporting it as one would be noise.
 */
export function normalizeComparableTitle(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}
