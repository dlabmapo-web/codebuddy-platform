/**
 * Every bound the content importer enforces, in one place.
 *
 * They live here rather than beside the code that checks them because three
 * separate layers have to agree about each one: the browser refuses a file
 * before uploading it, the reader refuses it while expanding it, and the
 * planner refuses it while counting rows. Three copies of "10 MiB" is how a
 * wizard ends up telling a Team Lead their workbook is fine and the server
 * disagreeing a second later.
 *
 * See §10 of the team lead Excel problem import design.
 */

/**
 * §5.1 — the workbook format this build speaks.
 *
 * A missing or unsupported version rejects the file before any row is read. The
 * alternative — accepting an old workbook and guessing what its columns now
 * mean — is the failure mode the version exists to prevent: a future format
 * gets a new number rather than quietly changing what column six means.
 */
export const CONTENT_IMPORT_TEMPLATE_VERSION = 1;

/** §10 — the compressed upload cap, enforced while the body streams. */
export const CONTENT_IMPORT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * §10 — the inflated cap.
 *
 * Separate from the upload cap because a zip bomb is small on the wire and
 * enormous in memory. The ratio between the two is the whole guard.
 */
export const CONTENT_IMPORT_MAX_EXPANDED_BYTES = 30 * 1024 * 1024;

/** §10 — more sheets than this is not the template, it is something else. */
export const CONTENT_IMPORT_MAX_SHEETS = 8;

/**
 * §10 — the ceiling on one import, and the reason Prepare offers a scoped
 * export.
 *
 * A course larger than this is exported module by module rather than refused,
 * so the importer never generates a workbook it would not accept back.
 */
export const CONTENT_IMPORT_MAX_PROBLEMS = 200;

/** §10 — matches the manual authoring cap, so a round trip cannot overflow. */
export const CONTENT_IMPORT_MAX_TESTS_PER_PROBLEM = 50;
export const CONTENT_IMPORT_MAX_HINTS_PER_PROBLEM = 20;

/** §10 — across every sheet, header rows excluded. */
export const CONTENT_IMPORT_MAX_TOTAL_ROWS = 12_000;

/**
 * A Structure row can contribute a module and a lecture, while a Problems row
 * can also pull its existing lecture and module into the result tree. The
 * problem cap bounds that extra ancestor pair, so this is the tight durable
 * receipt bound implied by the row and problem limits.
 */
export const CONTENT_IMPORT_MAX_RESULT_ENTITIES =
  CONTENT_IMPORT_MAX_TOTAL_ROWS * 2 + CONTENT_IMPORT_MAX_PROBLEMS;

/**
 * §10 — the aggregate decoded size, checked while cells are decoded.
 *
 * Row and sheet counts alone do not bound memory: two hundred cells each
 * holding a hundred thousand characters is a legal-looking workbook and a
 * twenty-megabyte string table.
 */
export const CONTENT_IMPORT_MAX_TOTAL_CELL_CHARS = 20_000_000;

/** §9.3 — a preview older than this describes a course that has moved on. */
export const CONTENT_IMPORT_PREVIEW_TTL_MS = 30 * 60 * 1_000;

/* ------------------------------------------------------------ cell bounds */

/** §5.2 — a stable key is an identifier, not a paragraph. */
export const CONTENT_IMPORT_MAX_KEY_LENGTH = 80;

/**
 * The per-cell caps, matching the manual authoring schemas exactly.
 *
 * Deliberately the same numbers as `content/course.ts` rather than looser ones.
 * An importer that accepts a longer title than the editor does creates content
 * the editor cannot then save, which turns one bad row into a problem nobody
 * can fix from the interface.
 */
export const CONTENT_IMPORT_MAX_TITLE_LENGTH = 200;
export const CONTENT_IMPORT_MAX_TEXT_LENGTH = 10_000;
export const CONTENT_IMPORT_MAX_CODE_LENGTH = 100_000;
export const CONTENT_IMPORT_MAX_TRIGGER_LENGTH = 2_000;

/**
 * How much of a value the preview shows before it truncates.
 *
 * The preview is a table a person reads, and a hundred thousand characters of
 * starter code in a cell makes the row above it unreachable. The full value is
 * available in the detail panel; this is only what the grid renders.
 */
export const CONTENT_IMPORT_PREVIEW_VALUE_LENGTH = 160;
