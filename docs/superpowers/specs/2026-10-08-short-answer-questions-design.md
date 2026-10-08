# Short-answer questions: Elice behavior parity

Date: 2026-10-08

Status: implemented and verified on localhost on `feat/lecture-pdf-materials`; production flags remain disabled; Elice reference gaps remain unverified

Branch: `feat/lecture-pdf-materials`, alongside PDF and turtle features

Reference: [Elice inspection](../../research/2026-10-08-short-answer-questions.md). This spec extends the written-response portion of the [turtle design](2026-10-08-turtle-graphics-design.md); it does not change turtle execution or ordinary programming judging.

## 1. Goal and evidence boundary

Cove teachers can add a short-answer question to a lecture. Students read rich instructions, enter a multiline text answer, explicitly submit it, and receive either teacher assessment or an automatic matching result. The question works without a Python editor, GUI service, or turtle runtime.

Elice's inspected Subjective editor supports manual grading, one exact answer in Normal Mode, and a regex in Advanced Mode. Its regex preview permits substring matches unless anchored. It offers placeholder text, score exclusion, and an optional explanation described as visible after solving. The inspected material is manually assessed and score excluded.

We inspected the learner input, author editor, preview, and the user's empty tutoring record. No real submission or grade was created. Automatic scoring, normalization, final-attempt selection, and explanation timing below are proposed Cove rules where the reference is unverified. Complete behavioral parity must not be claimed until those gaps are checked against authorized disposable Elice work.

## 2. Scope and architectural choice

| Approach | Trade-off and decision |
|---|---|
| Extend `WRITTEN_RESPONSE` with a typed short-answer definition | Recommended. Reuses permissions, mixed navigation, immutable submissions, manual review, and score projections. Adds only question-specific authoring and automatic matching. |
| Add a separate `SHORT_ANSWER` material type | Clear taxonomy, but duplicates routing, answer storage, review, and copy/progress handling already supplied by written responses. Not selected. |
| Expose the existing manual response form independently | Smallest change, but omits exact/regex matching and explanation behavior. Insufficient for the requested feature. |

Required: authoring and preview; learner answer/Submit/leave guard; manual, exact, and regex assessment; protected answer definitions; conditional explanations; class progress; teacher review; library copy/adoption; localhost E2E coverage.

Outside scope: multiple choice, OX, ordering questions, timed exams, multiple questions inside one material, AI answer generation/grading, automatic essay semantics, and importing Elice course content. The AI Answer Helper observed in Elice is recorded but is not required for the core short-answer behavior in this release.

## 3. Data and compatibility

Keep `Material.type = WRITTEN_RESPONSE`. Store a schema-validated `ShortAnswerDefinition` in the nullable server-private `ManualMaterial.shortAnswer` JSON field. This keeps existing configuration copy/adoption atomic without a second material relation; its logical ownership is one definition per written-response material. Its presence opts the material into the new interaction; absence preserves the existing manual written-response contract.

| Definition field | Contract |
|---|---|
| `version` | Schema version 1; definition changes participate in material content revision |
| `question` | Required caption, non-whitespace, at most 1000 characters |
| `gradingMode` | `MANUAL`, `EXACT`, or `REGEX`; author selects explicitly, initial default MANUAL |
| `expectedAnswer` | Server-private literal, required only for EXACT, at most 10,000 characters; non-whitespace definition |
| `pattern` | Server-private regex, required only for REGEX, at most 2000 characters; syntactically valid |
| `explanationEnabled` / `explanation` | Optional rich content, at most 100,000 characters; enabled content must have meaningful text or an allowed image |

Reuse ManualMaterial description for left instructions, hint for the placeholder (1000 characters), private modelAnswer for teacher guidance, and score/submission settings. No starter Python files, GUI profile, source assets, or runtime selection are needed for a short answer. Rich teaching images use existing private content-asset authorization.

Learner answers are plain text, at most 10,000 characters using the existing shared JavaScript string-length convention. Reject the empty string; accept whitespace-only text in the new flow because Elice's UI enables it. It receives the normal configured grading result, never an automatic completion solely because it was submitted. Preserve exact text; do not trim or coerce it. These server and length rules are Cove policies; Elice's server limits were not verified.

Existing written responses remain manually assessed, retain autosaved drafts and non-whitespace validation, and keep historical attempts unchanged. New definitions are not added automatically to legacy records. Conversion is allowed only when the material is unpublished and has no attempts; explain the draft/assessment change and require explicit author action. Existing legacy drafts remain retained but are not restored into the new explicit-submit input. Material type itself is immutable.

## 4. Authoring and publication

Add an independent Add short-answer question action to the lecture builder. Use Cove styling with Elice's interaction structure: rich instructions, question caption, Subjective answer form, manual checkbox, Normal/Advanced tabs, placeholder, explanation toggle, title, and score exclusion. Show no runtime settings.

Manual checkbox selects MANUAL and disables automatic definitions/preview. When unchecked, Normal selects EXACT and Advanced selects REGEX. Retain unsaved values while switching tabs, but persist only the active mode's required definition. Do not reinterpret a regex as an escaped literal without an explicit author edit; the controls show which interpretation is active. Save validates every active required field and rejects invalid regexes. Preview runs on explicit Test and shares the backend evaluator used for submission.

Use existing curriculum permissions, hidden-by-default creation, lecture ordering, visibility inheritance, revision conflicts, rich-content sanitization, and asset checks. An author-owned preview must not create a learner attempt or affect progress. Keep score exclusion independent from manual/automatic grading. Initial Cove defaults remain score excluded, Submit enabled, maximum 100 points. Reject score inclusion when Submit is disabled. Submission availability is an existing Cove control, not a verified Elice subjective control.

Freeze grading mode and answer definition while published or after any submission exists. An unpublished material without submissions can change them. After submissions, changing the assessment requires a new material; do not silently regrade old attempts. Instructions, title, placeholder, and explanation can be revised using existing optimistic content revisions. Each attempt retains the full revision snapshot, including explanation content and enablement. Score configuration edits affect only future attempts.

Copy/adoption includes sanitized public content, authorized private definition, explanation, and asset references using existing ownership rules. It copies no drafts, attempts, evaluations, or reviews. Copies start hidden and editable. Mixed-material workbook protections continue to reject destructive exercise-only replacement.

## 5. Learner workspace and unsent input

On desktop, show instructions on the left and `Q.` caption, rich question context from instructions, multiline answer box, and Submit on the right. On narrow screens stack the instructions and answer area. Use accessible labels in addition to placeholder text. Preserve the material drawer, Previous/Next, lesson position, and fullscreen across PDFs, coding exercises, turtle, legacy written responses, and short answers. No Run, terminal, or GUI tab appears.

Submit is disabled for length zero, an in-flight request, unavailable submission, or invalid membership/material access. A space enables Submit in this new flow. Enter inserts a newline rather than submitting. Inputs support Korean, Uzbek, other Unicode text, and keyboard/screen-reader use.

Maintain unsent changes only in the current workspace's memory. New short-answer materials do not call the legacy draft autosave endpoint. Dirty edits trigger a leave/discard guard for internal navigation and the browser's available unload protection. Cancel preserves text; confirmed leave discards it. Reload/re-entry shows a separate read-only latest submitted answer and an empty new-answer box. This re-entry layout is a Cove policy; Elice's post-submit layout was not tested.

Submit captures an immutable answer/revision/class snapshot with a stable request UUID. Disable duplicate clicks. On network or evaluator failure retain the text and UUID for retry; only accepted submission clears dirty state and the entry box. If an attempt was accepted but the response was lost, retry resolves the same attempt. Subsequent deliberate submissions use new UUIDs. Stale content returns a conflict before admission and offers reload after the learner preserves their text; never silently submit against a changed prompt.

Display distinct Not submitted, Awaiting teacher review, Evaluating, Correct, Incorrect, Reviewed, and Evaluation unavailable states. Wrong answers are accepted attempts, not request failures. Feedback/result presentation uses explicit text rather than color alone. No timers or attempt limits are introduced.

## 6. Evaluation contract

| Mode | Evaluation | Proposed result policy |
|---|---|---|
| MANUAL | No automatic comparison | Awaiting teacher review; existing score/completed/feedback review controls determine outcome |
| EXACT | Literal string equality | Correct gives full snapshotted maximum and completed=true; incorrect gives zero and completed=false |
| REGEX | Case-sensitive regex search with no implicit anchors or flags | Same binary score/completion rule as EXACT |

For EXACT, `orbit` matches `orbit`; `ORBIT`, ` orbit`, and `orbit\n` do not. Do not parse numbers, fold Unicode, trim, or collapse whitespace. For REGEX, `orbit` matches `orbital`, while `^orbit$` does not. Authors can express alternatives using regex alternation; no unobserved list of accepted answers is added. Literal matching normalization and submission-grade mapping are Cove policies pending Elice confirmation.

Use a versioned server evaluator, proposed version `short-answer-js-v1`, with JavaScript RegExp syntax and no flags. Elice's backend engine is unknown, so this choice is a documented compatibility boundary. Authors supply matching data only; their input is never evaluated as JavaScript code. The worker bootstraps fixed trusted code. No STDIO judge, Python process, or turtle dependency is involved.

Run regex compilation and matching in a terminable worker, never the API main event loop or browser main thread. Start with four workers, a queue capped at 16 jobs per API instance, and a 100 ms execution deadline after worker dispatch. Bound pattern/answer length before queuing. Terminate and replace a worker that exceeds the deadline; a saturated queue returns a retryable unavailable result. Apply existing authenticated rate limits to preview and submission. Resource limits are Cove operational defaults to validate under load, not measured Elice limits.

Syntax errors are author validation failures and prevent Save. Evaluation timeout/infrastructure failure is not Incorrect or a zero grade. Preview returns verdict or a useful error; it never changes any attempt. The preview and submission evaluator must share syntax, matching rules, limits, and version.

## 7. Attempts, review, and progress

Reuse immutable ManualSubmission answer/class/user/material/content revision/max-score/include-score snapshots and its request-key uniqueness. Add a server-private per-attempt assessment snapshot containing definition mode, literal/pattern, evaluator version, question/instructions, and explanation. Do not place private matching fields in the learner-visible profile or public revision endpoints.

Automatic admission atomically stores the attempt, private snapshot, and durable evaluation job. A lightweight API worker processes jobs independently of the Python judge. Unique per-attempt terminal evaluation records prevent duplicate scoring; transient failure is recorded separately and retry uses the same immutable snapshot. A restart recovers pending jobs. Status queries return only safe learner outcome fields. MANUAL admission instead enters the existing awaiting-review path without an evaluation job.

Store automatic results and the durable lease/job lifecycle in the per-attempt `ShortAnswerAssessment` row, alongside the private definition snapshot, not as a fabricated teacher/user review. A GRADED result is terminal; retry only transitions ERROR back to PENDING. Records include attempt id, evaluator version, verdict, score/completion, and timestamp. Existing append-only ManualReview remains the teacher override/audit mechanism. A published teacher review takes precedence over the automatic result for the same attempt; review version conflicts follow the existing API contract. Re-evaluation must not erase a teacher override.

The latest accepted attempt in the learner's class is active. A new pending attempt does not inherit an earlier correct result or review. Historical attempts remain visible to the learner and authorized teacher. This follows Cove's existing manual-material policy; Elice's final-attempt rule is unverified.

Reuse one projection function across learner status, teacher lists, course outline, class progress, and final score. Score exclusion affects numeric contribution, not access to submission/review. Pending/unavailable outcomes are distinguishable from zero. Preserve existing required-material completion and once-only award policies; do not create difficulty points or duplicate rewards on retries/teacher corrections. Ordinary programming and turtle results keep their existing rules.

The teacher view exposes submitted answers, attempt history, automatic result when available, and review controls. It distinguishes not submitted and awaiting review. Scope access to academy/class assignment; no cross-class or cross-academy answer lookup is permitted.

## 8. Private content and explanation release

Public learner workspace responses whitelist question, instructions, placeholder, submission/score configuration, and safe status. Never include exact answer, pattern, private model response, unreleased explanation, or teacher-only asset URLs in HTML, hydration data, exports, logs, or learner APIs. Private tables receive the same server-only/RLS treatment as existing manual assessment records.

Release enabled explanation only through an authorized attempt endpoint when the effective result for that attempt is completed=true. This means automatic Correct or a published teacher review marking completed. Incorrect, pending, and unavailable attempts receive no explanation. A teacher override removing completion hides it on subsequent requests, though previously viewed content cannot be recalled. Historical completed attempts can still expose their own snapshotted explanation; they never receive newer revision content. Do not expose literal/pattern as part of explanation release.

Rich text/images are sanitized and their access is checked using the same release decision. Generic solution endpoints must not bypass this rule. This concrete interpretation of Elice's 'after solving' helper remains a Cove policy until actual Elice release timing is verified.

## 9. Flags, migration, and rollout

Use `SHORT_ANSWER_ENABLED` in the API and `NEXT_PUBLIC_SHORT_ANSWER_ENABLED` in the web app for new authoring/admission. Existing published content and histories remain readable when admission is disabled, with clear availability text. Legacy manual-response authoring must also be decoupled from GUI gating; GUI flags and runtime discovery apply only to TURTLE_EXERCISE. Do not require Docker/VNC or GUI secrets to save/submit a written answer.

Migrations are additive: nullable definition JSON, private attempt snapshot with evaluation/job storage, constraints, and access policies. Existing materials without a definition stay manual, and old review/profile readers keep working. Copy, deletion restrictions, and retained assessment assets must preserve historical snapshots. Backend capabilities determine which modes the frontend offers during staged rollout; an older API must fail new payloads explicitly, not drop their grading fields.

Enable and verify on localhost first. Production flags remain off until migration, API/web deployment, evaluator capacity checks, and reference-gap review are complete. Do not modify the secret local deployment guide as part of this feature.

## 10. Acceptance and verification

| Area | Required verification |
|---|---|
| Author | Create all three modes; empty required fields; malformed regex; shared preview examples; explanation validation; published/submitted definition lock; revision conflict |
| Learner | Multiline/Unicode input; empty vs space Submit state; leave/cancel/discard guard; no autosave for new definitions; submit/re-entry; retained input on failure; no code/GUI controls |
| Exact | Case, leading/trailing spaces, newline, numeric-looking strings, and Unicode variants follow literal equality |
| Regex | Partial search vs anchors, alternation, escaped metacharacters, invalid syntax, long input, catastrophic backtracking deadline, queue saturation, and worker recovery |
| Manual | Awaiting review, score/feedback publication, partial score, completed vs needs revision, concurrent review conflict, and teacher override of automatic result |
| Attempts | Duplicate click/lost response uses one attempt; crash recovery; stale revision rejected; latest-attempt projection consistent; immutable historical configuration |
| Privacy | Learner payload/HTML/history contain no matching rule/model answer; explanation release by result/revision; cross-academy/class denial; private asset denial and table policies |
| Integration | PDF → short answer → turtle → code navigation; library copy has config but no attempts; legacy manual drafts/reviews unchanged; GUI disabled/unavailable throughout short-answer flows |
| Progress | Score included/excluded; pending distinct from zero; wrong after correct; teacher correction; no duplicate completion awards |

Run focused shared-schema/evaluator/API tests and localhost browser E2E with disposable Cove author/student/teacher accounts. At minimum E2E must exercise author creation/preview, student correct and incorrect automatic answers, manual submit/review, explanation gating, navigation guards, and the entire workflow with GUI disabled. Cover the main flow in Chromium and a second supported browser. Inspect actual API responses for privacy assertions rather than relying solely on hidden UI fields. Run relevant typechecks/builds and existing mixed-material/navigation regression checks.

Implementation verification is recorded in the [operations notes](../../operations/short-answer-questions.md). Before declaring complete Elice parity, separately verify its real exact/regex submissions, normalization, feedback/retry flow, score/completion selection, explanation timing, and teacher grade publication using authorized disposable reference work. Differences must update this spec and the research notes rather than being hidden behind a passing Cove test suite.
