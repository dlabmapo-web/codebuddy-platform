# Multiple-choice questions: Elice behavior parity

Date: 2026-10-08

Status: proposed design for review; implementation has not started

Branch: `feat/lecture-pdf-materials`, alongside PDF, turtle, and short-answer features

Reference: [Elice inspection](../../research/2026-10-08-multiple-choice-questions.md). Builds on the [short-answer assessment design](2026-10-08-short-answer-questions-design.md) without changing its matching rules or legacy written-response drafts.

## 1. Goal and evidence boundary

Teachers add a multiple-choice question to a lecture. Students read the question, select one answer or several answers according to its mode, explicitly submit, and receive an automatic result. The lesson works without a code editor, Python judge, regex evaluator, or GUI runtime.

Verified Elice behavior: single-mode radios replace prior selection and cannot be toggled off by clicking again; multiple-mode checkboxes toggle independently; Submit is disabled with no choices and enables with one; leaving edited work displays an unsent-change warning. Its author editor offers question caption, separate rich problem detail, optional instructions, correct-answer markers, shuffle, score exclusion, and optional explanation. Published questions lock structural answer controls. Empty enabled explanation prevents Save.

Elice submissions were not performed. Binary grading, final-attempt selection, explanation timing, shuffle persistence, limits, and teacher overrides below are concrete Cove policies pending reference verification. Implementation must not claim complete parity while these gaps remain.

## 2. Scope and architecture

| Approach | Trade-off and decision |
|---|---|
| Distinct MULTIPLE_CHOICE material, reuse existing assessment lifecycle | Recommended. Expresses structured selections accurately while sharing immutable attempts, review, permissions, progress, and copying. |
| Add another definition to WRITTEN_RESPONSE | Fewer enum changes, but misrepresents choice answers as written text and complicates input/draft contracts. Not selected. |
| Build an independent quiz engine | Clean isolation but duplicates class scoping, attempts, teacher review, score projection, and mixed navigation. Not needed for one question per material. |

Required: single/multiple modes; rich question detail/options; author correct-key configuration; optional shuffling; explicit submission and leave guard; automatic binary grading; protected answers; explanation gating; teacher attempt history/review; course/class progress; library copy/adoption; localhost browser E2E.

Outside scope: question banks, multi-question exams, timers, surveys, ordering/drag-and-drop, AI generation, per-option partial-credit authoring, bulk Elice import, and copying Elice teaching assets. Two-option true/false activities can use SINGLE without another material type. Existing supplementary PDFs retain their current linking behavior; no new attachment system is introduced.

Add a focused shared `multiple-choice.ts` schema/evaluator contract, API multiple-choice authoring/submission service, author dialog, and choice workspace. Reuse scoped assessment helpers and existing lesson chrome rather than adding choice conditionals throughout the Python editor. Extend the existing result projection only where it must support the new automatic result.

## 3. Definition and storage

Add `Material.type = MULTIPLE_CHOICE`. Reuse one ManualMaterial configuration relation per material, adding nullable server-private `multipleChoice` JSON validated as `MultipleChoiceDefinition`. Despite the existing table name, it supplies assessment configuration for several material kinds. A multiple-choice material requires this definition and forbids `shortAnswer`; other material types forbid it. Legacy data is unchanged. Do not rename existing tables or migrate historical attempts into a new quiz engine.

| Field | Contract |
|---|---|
| `version` | Schema version 1 |
| `question` | Required nonblank caption, max 1000 JavaScript string units |
| `problemDescription` | Optional sanitized rich question detail, max 100,000 string units |
| `selectionMode` | SINGLE or MULTIPLE; default SINGLE |
| `options` | Ordered array of 2–20 items, each with unique UUID `id` and sanitized rich `content`; max 10,000 string units per option |
| `correctOptionIds` | Server-private unique subset of option IDs; exactly one in SINGLE, at least one in MULTIPLE |
| `shuffleOptions` | Boolean, default false |
| `explanationEnabled` / `explanation` | Optional private rich explanation, max 100,000 string units; enabled content must be meaningful |

A rich field required to be meaningful contains visible non-whitespace text or an allowed authorized image. Reject empty formatting-only options. Allow duplicate option text because identity comes from IDs; show authors a duplicate-content warning. Rich options support the existing safe text/code/link/image subset and meaningful image alt text. This rich-option support and all option limits are Cove policies, not measured Elice constraints.

Reuse ManualMaterial description for optional left instructions, revision, Submit availability, score inclusion, and integer hundredths maximum. Multiple choice uses no starter files, entry point, GUI profile, or regex settings; API author payloads must not require them. Images use existing private content asset storage and academy/course authorization. Preserve assets referenced by historical attempts and released explanations.

## 4. Author workflow and locks

Add an independent Add multiple-choice question action in the lecture builder. Form fields: title; optional instructions; question caption; separate rich problem detail; Single Answer / Multiple Answers; option editors with correct-answer radios/checkboxes; Add Option, Remove, and keyboard-accessible Move Up/Down; Shuffle answer order; explanation toggle/editor; score exclusion. Correct markers are teacher-only.

New forms start hidden, SINGLE, two empty options, no correct key, shuffle off, explanation off, score excluded, maximum 100 points, Submit enabled. Save requires meaningful options and a valid key. At two options Remove is disabled; at twenty Add is disabled. Removing a correct option removes its ID from the key and requires a replacement before Save. Reordering preserves IDs and correctness. Switching MULTIPLE to SINGLE clears an incompatible multi-ID key and requires the author to choose one; never silently select the first correct option.

The author can preview student layout without exposing correctness in the preview or creating a learner attempt. Preview grading uses the same bounded server comparison and reports a result only to the authorized author. This preview is a Cove addition; Elice's available creation preview was not verified.

Freeze selection mode, option IDs/count/order, correct IDs, and shuffle while the material is published or has any attempts. Backend must enforce the same lock as the UI. Option text, question, detail, instructions, title, and explanation may be edited with optimistic content revisions; existing attempts retain snapshots. Explain that such wording edits can change meaning and affect future attempts only. Score settings also apply to future attempts. A changed key or structure after submissions requires a new material, with no silent historical regrade.

Use existing curriculum edit permissions, visibility inheritance, material ordering, asset checks, sanitization, and revision conflicts. Material type is immutable; no conversion of existing short-answer or turtle materials is introduced. Submit-disabled plus score-included is invalid. Submit availability and maximum-score defaults are Cove controls/policies; they were not verified as Elice choice controls.

## 5. Student presentation and selection

When left instructions are empty, center the question card as in inspected Elice examples. Otherwise show instructions on the left and question card on the right; stack on narrow screens. The card contains `Q.` caption, optional rich detail, vertically stacked full-width option cards, and Submit. Preserve material drawer, Previous/Next, position, and fullscreen. No code, Run, terminal, or GUI controls.

Use native radios for SINGLE and checkboxes for MULTIPLE with fieldset/legend, accessible option names, visible focus, and a textual Select one / Select all that apply instruction. Card clicking activates its input; clicks on an embedded link follow the link without changing selection. Keyboard and screen-reader selection must work. Selected/result state must not rely on color alone. Options with images wrap within the card and remain usable at narrow widths.

Initially nothing is selected. SINGLE selection replaces the old choice, and clicking the selected radio retains it. MULTIPLE options independently toggle; unchecking the final choice disables Submit. Do not constrain the learner to the number of correct options or reveal that count. Submit is disabled for zero selections, an in-flight request, unavailable submission, or inaccessible material/membership.

Maintain unsent selection in workspace memory; do not autosave into ManualDraft. After any selection edit, the workspace stays dirty until accepted submission or confirmed discard, even if all choices are subsequently cleared. Internal navigation and supported browser unload protection warn about loss. Cancel retains selections and order; confirmed leave discards them. Reload/re-entry presents an empty new-answer form and separate read-only attempt history. Re-entry/history layout and browser-unload behavior are Cove policies beyond the reference observations.

## 6. Shuffle and submission identity

Use stable opaque UUIDs for option identity. Correctness never depends on visible position, option text, labels such as A/B, or client-supplied correctness fields.

For shuffle=false display stored author order. For shuffle=true generate a permutation on the server when loading the learner workspace. Keep that permutation stable throughout the current workspace, result polling, failed submission retries, and leave/cancel interaction. A fresh workspace visit may generate a new order; do not promise cross-device or cross-attempt ordering. Record the displayed order in each accepted attempt so history and teacher review reproduce it. Reference shuffle persistence is unverified.

Submit sends material/class scope, loaded content revision, selected option IDs, displayed order, and stable request UUID. Server validates authorization and revision, checks displayed order is exactly a permutation of revision option IDs, and checks selection has unique known IDs and permitted cardinality. SINGLE requires exactly one; MULTIPLE requires one through option count. Reject unknown IDs, duplicates, extra fields, and empty selections. Order is presentation metadata, not trusted grading input; a client rearranging it cannot alter correctness.

Disable duplicate clicks. Retry after lost response resolves the same accepted attempt and result. A request UUID reused with different material/class/selection/revision/order returns a conflict. New deliberate submissions use new UUIDs. On rejection/network failure retain selection and order; after acceptance clear dirty state and entry selection. A stale revision is rejected before admission, preserving the answer and offering an explicit reload; never apply selections silently to revised options.

## 7. Grading and immutable attempts

Proposed evaluator version: `multiple-choice-set-v1`. SINGLE is correct when its sole selected ID equals the sole correct ID. MULTIPLE is correct only when selected and correct ID sets are identical; array order is irrelevant. Missing a correct option or adding an incorrect one is Incorrect. Full match gives the snapshotted maximum and completed=true; incorrect gives zero and completed=false. No automatic partial credit or penalties. These scoring/completion rules require later Elice verification.

Examples using original synthetic IDs: key {a,c} accepts {c,a}; {a}, {a,c,d}, and {b} are incorrect. Duplicate {a,a,c} and unknown IDs are invalid requests, not normal wrong answers.

Admit, snapshot, compare, and store the terminal result atomically in one database transaction. Set comparison is bounded to twenty items and needs no evaluator worker, durable queue, sandbox, or executable author data. A database failure admits no partial attempt; return a retryable error without labeling it Incorrect. Existing request uniqueness handles concurrent retries.

Reuse ManualSubmission identity/class/user/material/revision/max-score/include-score/request-key snapshots and ManualReview history. For choice attempts, legacy `answer` is empty and `files` is `{}`; do not serialize choice answers into freeform text. Add one-to-one private MultipleChoiceAssessment storing immutable full definition, selected IDs, display order, evaluator version, terminal verdict, score/completion, and evaluation timestamp. Its public history DTO separately whitelists the snapshotted question/options, selected IDs/order, and safe result; correct IDs and unreleased explanation never leave the private row. No ShortAnswerAssessment may coexist on the same attempt.

Database guards prevent rewriting selected IDs, order, definition, or terminal result. Extend server-only table policies/RLS and revoke direct anonymous/authenticated database access. Preserve append-only teacher review and optimistic review version. Teachers may publish score/completed/feedback overrides through the existing scoped review flow; these take precedence over the automatic result without rewriting it. No new manual author-grading mode is required. Teacher overrides are Cove consistency behavior, not a verified Elice choice feature.

Latest accepted attempt within the learner's class is active, following existing assessment policy. A later wrong answer replaces earlier active completion/score, while history remains. Reuse a single effective-result projection across learner workspace, teacher roster, course outline, class progress, final-score calculations, and explanation access. Extend it for choice results without changing short-answer or legacy review precedence. Score exclusion removes numeric contribution but preserves submission/history. Keep existing completion-award rules and once-only award identity; no programming difficulty points or duplicate rewards on retries/overrides.

## 8. Private answers and explanation release

Learner definition DTO includes only caption, instructions/detail, safe options/order, selection mode, revision, and public submission/score configuration. Exclude correct IDs, author correctness markers, model answers, unreleased explanation, and teacher-only asset URLs from learner API responses, HTML/hydration, exports, logs, and status/history payloads. An author endpoint is separately permission-scoped. Do not return the full private JSON via generic content or library endpoints.

Automatic result exposes Correct/Incorrect, score, completion, timestamp, and selected choices. It does not highlight or identify correct unselected options. Rich explanation may intentionally discuss the answer after release, but the answer-key field itself remains private. The reference's correct-option disclosure was not observed, so this is an explicit Cove policy.

Release enabled explanation through an authorized attempt endpoint only when its effective result is completed=true, including a published teacher completion override. Wrong/pending/unavailable results receive none. Return that attempt's snapshotted explanation, never current content from a newer revision. A later override removing completion hides explanation on subsequent requests; already seen content cannot be recalled. Historical completed attempts retain access to their own explanations. Apply the same gate to explanation images and prevent generic solution/download endpoints bypassing it. This interpretation of Elice's after-solving helper remains provisional reference parity.

## 9. Navigation, copying, and rollout

Introduce a canonical `/learn/quizzes/[materialId]` workspace route using the existing academy lesson shell and a type-aware route helper. Update all mixed-material navigation and teacher review links, including transitions from PDF, short answer, turtle, and programming. Reuse assessment review components through a typed choice-answer renderer; do not display raw IDs as student answers.

Library copy/adoption carries sanitized definition/key, explanation, and authorized assets but no attempts, drafts, results, or reviews. Copies start hidden and get new option IDs with correct-key references remapped atomically. Content revision starts at one. Teacher-only answer fields stay private in library listings. Retain existing protections against destructive exercise-only workbook import replacing mixed courses.

Add `MULTIPLE_CHOICE_ENABLED` API and `NEXT_PUBLIC_MULTIPLE_CHOICE_ENABLED` web flags, false by default and independent of short-answer/GUI flags. Capability discovery prevents an older API from silently accepting incomplete payloads. Flag-off disables new author saves/preview/admission, while existing published content/history, teacher review, and gated explanation remain readable with clear availability text. Feature flags are not authorization controls.

Migrations are additive: material enum value, nullable config field, private assessment table, immutable guards, mutual-exclusion enforcement, indexes, and access policies. Deploy compatible API before enabling web creation. Keep production disabled until migrations, deployment, and localhost verification are complete. Do not edit the secret local deployment guide. All work stays on `feat/lecture-pdf-materials`.

## 10. Acceptance and localhost verification

| Area | Required checks |
|---|---|
| Author | Both modes; question/option/key validation; 2/20 boundaries; add/remove/reorder preserve identity; mode switching; rich sanitization/assets; explanation validation; structural locks enforced by API; revision conflicts; preview creates no attempts |
| Student | Empty/selected Submit state; radio replacement/reclick; multiple toggles; full-card and keyboard controls; Unicode/rich/image options; instructions present/absent layout; narrow screen; leave/cancel/discard; no autosave; re-entry/history |
| Grading | Single correct/wrong; multiple exact set in any order; missing/extra correct selections; all options correct; duplicate/unknown/empty rejection; bounded evaluator; atomic failure |
| Identity/shuffle | Stable IDs despite reorder/duplicate text; shuffle is a valid permutation; stable while editing/retrying; history preserves order; tampered order cannot affect grade; wrong revision retains answer |
| Attempts/review | Double click/lost response yields one attempt; changed UUID payload conflicts; later wrong replaces active correct; immutable database snapshots/results; teacher override and concurrent review conflict; histories remain separate by class |
| Privacy | Learner HTML/DTO/history/export contain no key/model answer; explanation and image gating by snapshotted revision/effective result; wrong-answer result doesn't disclose correct IDs; direct table privileges/RLS; cross-user/class/academy denial |
| Integration | PDF → choice → short answer → turtle → code and reverse navigation; copy/adoption remaps IDs without attempts; mixed import protections; legacy drafts/results unchanged; GUI and short-answer flags off during choice workflow |
| Progress/flags | Included/excluded scores; once-only rewards; override completion changes; capability mismatch; flag-off histories readable and new submissions unavailable |

Run focused shared evaluator/schema and API tests, storage-policy/immutability verification, relevant typechecks/builds, and localhost E2E using disposable Cove author/student/teacher fixtures. E2E must create SINGLE and MULTIPLE questions, test wrong/correct submissions and explanation gating, shuffle/history identity, navigation discard/cancel, and teacher override. Cover the principal flow in Chromium and a second supported browser. Inspect real API responses for privacy, not only hidden UI controls. Use original synthetic questions and no live Elice submissions or imported assets.

Before claiming complete Elice parity, compare authorized disposable Elice submissions for wrong/correct/partially correct multi-selection, results and retries, score/completion, explanation/answer disclosure, shuffled revisits, and teacher review. Record observed differences in the research and adjust this spec explicitly.
