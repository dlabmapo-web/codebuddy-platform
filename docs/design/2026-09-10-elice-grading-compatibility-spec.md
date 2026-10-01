# Elice grading behavior and Cove compatibility specification

Date: 2026-09-10

Status: Research-backed design; not implemented. No Elice changes were saved, no answers submitted, and no student scores changed during inspection. No Git commit is requested or authorized.

Reference course: [765886 — DLAB Python track](https://dlab.elice.io/courses/765886/lectures/all).

Cove source inspected at local HEAD `68e12de`. Source observations describe that checkout, not a newly verified production deployment.

## 1. Objective and evidence boundaries

Make Cove support the grading capabilities and observable semantics found in this Elice course: automatic STDIO checks, weighted scores, grading feedback, configurable execution limits, and a path to custom scripts and manual adjustments. This concerns grading, not recreating Elice's entire learning platform.

This document is the single reference for the observations, proposed implementation, migration, and verification work. It does not claim that every exercise in the course was opened, that Elice's private backend was inspected, or that a browser submission comparison was executed. A manager-visible generated grader is strong evidence for that exercise's intended logic, but it is not proof of every surrounding platform behavior. Unverified areas are explicitly tracked in section 15 rather than silently assumed.

Evidence labels used below:

- **Observed UI:** visible manager/editor settings in the signed-in course.
- **Observed source:** code displayed by Elice's Code Viewer for a selected exercise.
- **Documented:** official Elice documentation.
- **Derived:** a consequence of the observed algorithm, not a submission test performed on Elice.
- **Cove requirement:** proposed behavior or architecture for our implementation.

### 1.1 Reference inventory

| ID | Reference | Inspection coverage |
| --- | --- | --- |
| E1 | [CH01 problem 1 editor](https://dlab.elice.io/courses/765886/lectures/6637912/lecturepages/54487968/edit) | Skeleton/grader file trees, STDIO settings, code viewer, actual grading manifest, generated autograder, Basic Info, grading type, execution environment, Achievement |
| E2 | [Advanced input/output calculator editor](https://dlab.elice.io/courses/765886/lectures/6637953/lecturepages/54488557/edit) | Three weighted STDIO cases, messages and variable help; workspace Run/Submit controls |
| D1 | [Input/output grading](https://help.elice.io/help/en/docs/elicelxp/for-admin/material/exercise/grading/stdio) | Five comparison options and generated-grader authoring |
| D2 | [Grading scripts](https://help.elice.io/help/en/docs/elicelxp/for-admin/material/exercise/grading/script/) | Run/Submit entrypoints and teacher-defined code |
| D3 | [Python script grading](https://help.elice.io/help/en/docs/elicelxp/for-admin/material/exercise/grading/script/python/) | Reporting messages/scores, custom checks, error disclosure guidance |
| D4 | [Manual grading](https://help.elice.io/help/en/docs/elicelxp/for-admin/material/exercise/grading/manual) | Adjusting an existing submitted score through Tutoring |
| D5 | [Grading overview](https://help.elice.io/help/en/docs/elicelxp/for-admin/material/exercise/grading/) | STDIO, custom scripts, and manual grading as distinct methods |

E1 and E2 were read through the authorized manager session. The specification summarizes behavior and records reproducible examples; it does not embed a copy of Elice's full implementation or student records.

## 2. What Elice actually does

### 2.1 The three grading paths

Elice distinguishes automatic input/output grading, teacher-written grader scripts, and manual review. STDIO is appropriate when inputs and expected output determine correctness. Scripts allow other program checks. Manual grading lets a teacher evaluate submitted work. These are separate capabilities, not five names for one comparison function. [D5]

For E1, the actual execution chain observed is:

```text
Run → .elice/runner.sh → python3 -u main.py

Submit → .elice/grader.sh → python_sys -u .elice/autograder.py
       → read .elice/elice_exercise.json
       → execute configured command for each case
       → compare stdout and calculate awarded points
       → send grading messages and final raw score through Elice utilities
       → platform applies its material grading policy
```

The generated autograder invokes the runner through a subprocess for each check. This differs from Cove's persistent Pyodide runtime threads. Do not assume both runtimes behave identically just because both execute Python.

### 2.2 Active files versus example files

E1's grader tree includes `.elice/input`, `.elice/output`, `autograder.py`, `elice_exercise.json`, `grader.py`, `grader.sh`, `grader_elice_utils.py`, and `runner.sh`.

The separate `grader.py` contains a function-checking example that imports the student's module, invokes a named function, compares returned values, and uses 30/30/40 point weights. **It is not the active entrypoint in E1:** `grader.sh` invokes `autograder.py`. File presence alone does not establish which grading method is used.

The skeleton tree also exposes auxiliary files and a `main.py` entrypoint. E2 has an additional `sol.py` in its visible workspace file tree. Its presence does not establish visibility policy for all Elice courses or authorize exposing Cove's private solutions.

### 2.3 Authoring surfaces

Observed tabs include Skeleton Code, Grader Code, Basic Info, Grading settings, Achievement, and AI Helpy Guide. Relevant controls:

| Surface | Observed controls | Implication for Cove |
| --- | --- | --- |
| Grader Code | Run shell command; grading enabled switch; STDIO case builder; Code Viewer; grading messages | Grader settings belong to a versioned exercise configuration |
| STDIO case | Comparison method, integer points, input, expected output/pattern, time limit in seconds | Cases need more than input/output strings |
| Basic Info | Exclude material from score; enable/disable Submit; file-tree display choice | Grade contribution and submission availability are independent policies |
| Grading settings | Relative grade (labeled default), Absolute grade, grader-allowed IPs | Raw grader score and applied material score are separate concepts |
| Environment | Selected environment, overall time limit, memory limit, optional GUI view | Per-case limits do not replace overall job limits |
| Achievement | Optional certificate for passing the material | Pass state may trigger effects beyond storing a number |

The inspected input/output fields display a 50,000 counter limit; this was not tested with multibyte input, so do not infer a precise byte-versus-character contract from the display alone.

## 3. Comparison rules: exact observed semantics

The five UI choices and generated names are:

| UI rule | Generated identifier | Observed algorithm |
| --- | --- | --- |
| Output is the same | `stdout` | Compare after trimming trailing whitespace on each line and at the end |
| Output contains a string | `stdout_match` | Expected text must occur as a literal substring of actual output |
| Output does not contain a string | `stdout_nomatch` | Logical negation of the substring check |
| Output matches regular expression | `stdout_regex` | Python `re.search(pattern, output)` finds a match |
| Output does not match regular expression | `stdout_regex_nomatch` | Logical negation of the regex search |

The names come from the UI and E1's generated source. D1 independently documents the five options.

### 3.1 “Same output” is not byte-for-byte matching

Observed source uses Python line splitting, applies right-trimming to each line, joins with newline characters, and right-trims the combined result. Leading whitespace and whitespace between values still matter. Python's Unicode whitespace/line splitting behavior matters for edge cases.

Derived examples, with escaped whitespace displayed explicitly:

| Expected | Actual | Elice-style same-output outcome |
| --- | --- | --- |
| `Hello` | `Hello\n` | Pass |
| `A\nB` | `A  \nB\n` | Pass |
| `A\nB` | `A\r\nB` | Pass |
| `A B` | `A  B` | Fail |
| `Hello` | `hello` | Fail |
| `Hello` | ` Hello` | Fail |
| `A\nB` | `A\n\nB` | Fail |
| empty | only whitespace | Pass after normalization |

Cove currently trims only the end of the whole output and normalizes CR/CRLF. The second example therefore distinguishes Cove's current behavior from the inspected Elice comparator.

### 3.2 Contains and does-not-contain

The observed substring comparator does not call the same-output normalizer. Treat whitespace, case, and newlines literally after the runtime/file-reading layer has delivered the strings.

- Required `Hello` matches `Welcome! Hello Alice`.
- Required `5` also matches `500`; this is why contains is inappropriate for a strict numeric answer.
- Required `Hello\n` does not match `Hello` without the newline.
- Empty required text is contained in any string under Python substring semantics; the negative rule consequently fails. Cove should warn authors about this and require intentional confirmation before publishing such a case, rather than silently change its meaning.

### 3.3 Regex means search, not full-string match

The inspected implementation uses Python's regex engine without explicit flags in the call. Inline flags remain part of a pattern's meaning. Invalid patterns are caught while loading the grading configuration.

- `[0-9]+` matches the numeric part of `ID: 123`.
- `^STUDENT-[0-9]{3}$` restricts the shape much more tightly.
- Python `$` can match before a final newline; it is not interchangeable with a strict end-of-string anchor.
- Case sensitivity, Unicode classes, multiline behavior, lookarounds, backreferences, and invalid-pattern errors require compatible semantics.

Cove must not label JavaScript `RegExp` or an RE2 subset as full Python-regex compatibility. Either execute a pinned Python-compatible matcher with a parent-enforced resource budget, or clearly publish a restricted supported subset and reject incompatible imports. Do not run unbounded regex against user output on the API's request thread.

## 4. Concrete course examples

### E1: introductory printing problem

Observed configuration: one `stdout_match` case; 100 points; empty displayed input; expected text is three lines `30 40 50`, `100`, `200`; 60-second case limit; grading enabled; Absolute grade selected.

A program that prints that entire block with additional prefix/suffix text can satisfy the configured substring rule. That is derived from the observed comparator, not a submission made during this inspection.

### E2: calculator exercise

The exercise asks for addition, subtraction, multiplication, and division of two input integers. Its observed cases are:

| Case | Input lines | Expected output lines | Rule | Points | Limit |
| --- | --- | --- | --- | ---: | ---: |
| 1 | `3`, `3` | `6`, `0`, `9`, `1.0` | Same output | 30 | 60 s |
| 2 | `0`, `10` | `10`, `-10`, `0`, `0.0` | Same output | 30 | 60 s |
| 3 | `3`, `2` | `5`, `1`, `6`, `1.5` | Same output | 40 | 60 s |

Passing only the third case earns 40 raw points. Passing the first two earns 60. Cove's equal-case percentage would instead produce 33 and 67. Weighted scoring is therefore necessary for this course's behavior, not merely a hypothetical feature.

## 5. Execution, limits, and failure behavior

### 5.1 Observed generated runner

E1's autograder creates a subprocess with piped stdin/stdout/stderr, UTF-8 decoding with replacement for decoding errors, and a communication timeout. It measures elapsed wall time with a monotonic performance clock. On timeout it kills the direct process and waits for termination. The inspected source does not by itself prove descendant-process cleanup or the surrounding sandbox architecture.

It collects return code and stderr, but the observed STDIO decision function checks process timeout and stdout comparison; it does not consult return code or stderr in that decision. Consequently, code that prints matching output and then exits unsuccessfully could pass this comparator if no outer layer rejects it. **This is a source-derived compatibility concern, not a verified Elice submission result.**

Cove currently treats execution errors as runtime errors before comparing output. Preserve that behavior for existing exercises. An Elice-compatible exit policy requires a targeted differential test and an explicit named policy; do not silently weaken it globally.

### 5.2 Two levels of execution limit

E1's environment panel displays Java 8 + Python 3, an overall 70-second limit for Run/submission, and 512 MB memory. Its individual grading case allows 60 seconds. These values are specific to E1, not platform-wide defaults.

The generated case schema also supports optional language-specific time-limit overrides. An applicable override must be numeric and positive. The actual language runtime/version beyond the visible environment label was not verified.

For Cove, define and enforce separate budgets for:

- Individual student-program execution.
- Total submission grading, including all cases and comparator work.
- Regex execution.
- Memory, processes, output, and filesystem use.
- Queue age/admission, which is not student execution time.

Current Cove accepts `memoryLimitMb` in its execution request, but the inspected Pyodide thread does not reference that field. The container's memory ceiling is not equivalent to per-submission memory enforcement. This gap needs implementation and tests before making an equivalent-limit claim.

### 5.3 Soft time limit and point penalty

Observed source supports `time_limit_soft` and `time_limit_soft_penalty`, even though those fields were not visible in the simple case editor inspected.

Validation requires both fields together, `0 < soft < hard`, and `0 <= penalty <= case points`. The decision ordering is:

1. Hard timeout: timeout result, zero points.
2. Incorrect output: wrong result, zero points.
3. Correct output taking strictly longer than the soft limit: warning result, points minus penalty.
4. Otherwise: correct result, full case points.

Equality with the soft limit is not penalized by the observed strict comparison. A correct 40-point case with a 10-point soft penalty earns 30 points if it exceeds the soft limit without hard-timing out. The warning counts in the grader's pass counter, but is distinct from correct-without-warning.

### 5.4 Continue versus stop

The observed generated grading loop iterates over all configured cases. No early-stop branch is present for wrong output or an individual timeout. An overall environment limit can still interrupt the whole submission; its score persistence behavior remains unverified.

Cove source now continues after wrong outputs and runtime errors, and stops after TIME_LIMIT or MEMORY_LIMIT. Older statements in this conversation about stopping after every failure are outdated. In Elice-compatibility mode, continue individual checks after ordinary timeout if the worker is healthy and the total job budget permits. A job-budget abort must be represented separately from an incorrect unexecuted case.

## 6. Scoring and material policy

### 6.1 Raw grader score

The generated code sums configured case points into the possible total and adds awarded points as each case completes. Correct cases receive their weight; soft-timeout cases receive weight minus penalty; wrong and hard-timeout cases receive zero. It emits a final raw integer score through `secure_send_score`.

Source configuration validation permits zero-point cases. Empty-check and all-zero-total configurations need explicit tests before deciding how an Elice-compatible normalized percentage behaves; do not divide by zero or invent a pass rule.

### 6.2 Relative and absolute modes

Observed UI offers Relative grade (Default) and Absolute grade. E1 and E2 display the absolute-mode explanation. The grading-settings page states the absolute applied score is the minimum of material points and grader score. Thus raw 100 with a material cap of 20 yields 20, while raw 12 with a cap of 20 yields 12.

The UI displays a notice that the absolute setting is scheduled for end of support. Preserve it as an import/compatibility requirement where needed, rather than assuming it should become Cove's new default.

The exact relative-mode scaling formula, rounding, zero-total behavior, and platform clamping were not verified. Do not assume relative means class-rank grading. Cove can implement an explicitly named proposed proportional policy `material maximum × earned weight / possible weight`, but must not call it Elice-equivalent until the relative-policy probes pass.

### 6.3 Separate concepts in Cove

Persist distinct values: raw earned points, possible case points, applied material points, normalized display percentage, verdict/completion state, and gamification point awards. A certificate or a classroom point award is not the same thing as a case weight.

Also preserve submission-time policy/revision. Editing case weights must not reinterpret old stored scores or queued submissions implicitly. Explicit regrading must retain original results and audit the replacement revision.

## 7. Messages and student-facing results

E1/E2 expose six message templates: begin, end, correct, correct-with-warning, wrong, and timeout. A template can be blank to suppress that message. E2's help lists the following variables; the source also includes per-result variables:

| Scope | Variables |
| --- | --- |
| Running aggregate | `num_gc_all`, `num_gc_pass`, `num_gc_correct`, `num_gc_soft_timeout`, `num_gc_fail`, `num_gc_wrong`, `num_gc_timeout`, `score_total`, `score` |
| Current case | `gc_index` (zero-based), `gc_number` (one-based), `gc_score`, `gc_time_limit`, `gc_time_limit_soft`, `gc_time_limit_soft_penalty` |
| Current result, observed source | `gc_result_run_duration`, `gc_result_score` |

In the observed implementation, `score_total` starts at zero and increases during iteration; it is the full total only after all cases have been visited. Preserve this detail if importing message templates. Missing simple keys are rendered as a braced name by the observed formatter. Advanced format specifications, malformed braces, and nested lookups need probes.

Generated messages are sent through a grader-specific utility channel. Final scores are sent separately. Student stdout must never be interpreted as authoritative score commands in Cove.

Observed workspace controls include Run, Submit, last submission score, last submission datetime, and a terminal. Tutoring and View Solution are exposed in the manager session. Student-role solution permissions and feedback visibility were not tested by this manager inspection.

Cove requirements:

- Keep program output, grading messages, final result, and infrastructure errors distinct.
- Show queued/running/finished states, case progress, raw/applied score where appropriate, and warnings.
- Keep hidden inputs, expected outputs, patterns, source, and grader errors out of student payloads.
- Render templates as text; do not evaluate arbitrary template expressions or HTML.
- Preserve Elice-compatible simple placeholders through an allowlisted formatter. Reject unsupported syntax during authoring/import rather than fail after submission.
- Test SSE reconnect and final-fetch recovery. Result delivery failure must not look like an incorrect answer.

## 8. Custom scripts and manual grading

### 8.1 Custom grader scripts

Official documentation describes grader shell entrypoints, Python scripts, and utility calls for messages and final scores. It allows checking values or conditions beyond stdout and recommends safe generic error messages to avoid leaking grader internals. [D2, D3]

Cove's existing `ExecutionEngine` interface is an extension point, but adding only a comparator enum does not provide script compatibility. Custom graders require versioned private grader bundles, student multi-file submissions, a declared runtime/entrypoint, an authenticated result protocol, isolation, bounded resources, and a controlled authoring/validation path.

A teacher-written grader and student program are different trust domains. Student code must not read the private grader bundle or acquire database/Redis credentials. Never execute uploaded `.sh` or Python grader files in the API process or directly on the VPS host. Network access should default to denied; the observed Elice IP-allowlist UI motivates a separately controlled capability, not arbitrary outbound access.

Implement function/structured-value checking first through a narrow runner contract if that satisfies the curriculum. General script and multi-runtime support remains a distinct phase of this same grading roadmap. Do not claim complete grading parity while it is absent.

### 8.2 Manual adjustment

Elice's documented workflow uses Tutoring to select a student's submitted work, then adds or subtracts a score adjustment. At least one submission must exist before assigning a manual score. [D4]

Cove should record an append-only adjustment with submission ID, actor, reason, previous/effective score, delta, timestamp, and revision. Require appropriate academy/class authorization and optimistic concurrency. Preserve the automatic score as evidence. Define whether regrading supersedes, retains, or requires review of manual adjustments; proposed policy is to retain the adjustment record but flag the effective result for review after a changed automatic result.

Final bounds, effect on later attempts, and interaction with Elice's best/latest score policy remain unverified. Cove's policy must be explicit rather than inferred from a label.

## 9. Cove gap analysis

| Concern | Current inspected Cove | Required change |
| --- | --- | --- |
| Comparison | One normalized equality check | Versioned five-rule comparison contract |
| Whitespace | Trim output end, normalize CR/CRLF | Add line-wise Elice-style normalization without changing legacy cases |
| Regex | No comparator support | Python-compatible isolated evaluation or declared subset |
| Case weights | Equal percentage contribution | Nonnegative integer weight and awarded weight |
| Limits | Exercise-level request limits | Case override, optional soft threshold/penalty, total job budget |
| Failure continuation | Stop on time/memory; continue wrong/runtime | Compatibility continuation policy with explicit abort state |
| Runtime errors | Fail before comparing output | Keep legacy behavior; probe Elice stdout-after-crash edge before an explicit alternative |
| Material grade policy | Stored 0–100 score | Separate earned/possible/applied/display fields and policy snapshot |
| Messages | Product-defined progress/verdict | Safe configurable message templates and warning results |
| Memory | Request field not enforced in inspected thread | Real per-job enforcement and verification |
| Isolation | Warm Pyodide interpreter threads | Audit cross-run state; dedicated sandbox path for custom/native execution |
| Custom graders | No general script bundle contract | Authoring, validation, storage, isolated runner, trusted result channel |
| Manual scoring | Not established in inspected path | Authorized audited adjustment workflow |
| Regrading | Existing repair/regrade services | Extend snapshots and reconciliation to all new scoring fields |

Relevant files for implementation:

- `packages/api/prisma/schema.prisma`: exercise cases, submission snapshots/results, progress, score adjustments.
- `packages/shared/src/content/course.ts`: authoring/runtime schemas; currently up to 50 draft cases and 100,000-character input/output fields.
- `packages/shared/src/content/learn.ts` and `submission.ts`: public sample/result contracts and hidden-data protection.
- `packages/api/src/content/course.service.ts` and content-import services: authoring, copying, imports, grading revisions.
- `packages/api/src/learn/submission.service.ts`: authoritative configuration snapshots and access checks.
- `packages/api/src/judge/grading.ts`, `grading.service.ts`, `execution-engine.ts`, `pyodide-engine.ts`, `pyodide-thread.ts`: comparisons, scoring, execution, error handling.
- `packages/api/src/judge/regrade.runner.ts` and `packages/api/src/platform/regrade.service.ts`: repair path.
- `packages/web/src/lib/workspace/sample-run.ts` and `use-sample-runner.ts`: sample comparison consistency.
- Exercise authoring `answers-editor.tsx`, result panels, records, teacher progress, and point-award services: presentation and downstream consumers.

Read the installed Next.js guides before implementing Next.js code, as required by AGENTS.md. No application code is changed by this specification.

## 10. Proposed data and execution design

### 10.1 Immutable grading profile

Use a versioned profile per exercise, with an immutable copy on every submission. Proposed fields:

| Object | Fields/meaning |
| --- | --- |
| Profile | mode (`LEGACY_STDIO`, `ELICE_STDIO`, `CUSTOM`), semantic version, runtime version/digest, grading revision, total budget, continuation policy, exit-status policy, material-score policy, message templates |
| Case | stable ID/order, comparator, input, expected literal/pattern, weight, hard limit, optional soft limit/penalty, visibility, language overrides if supported |
| Submission snapshot | full profile plus all private cases, runtime identity, material maximum and policy, script bundle digest where applicable |
| Case result | verdict, output-match boolean, awarded/possible weight, duration, timeout/warning/error classification, sanitized sample output |
| Aggregate | raw earned/possible, applied material score, display percentage, completed/aborted flags, judge version, policy revision |

Names are proposed schema concepts, not existing API fields. Avoid storing contradictory derived values without a single authoritative calculation and reconciliation tests.

### 10.2 Submission lifecycle

1. Validate identity, class access, visibility, rate limit, and in-flight rules.
2. In a database transaction, snapshot the source code, case definitions, policies, and runtime identity.
3. Enqueue by submission ID; retries must be idempotent.
4. Worker claims the job and validates the profile version before execution.
5. Run each case with its own input and limits; compute comparison and awarded points outside student control.
6. Persist or emit bounded progress with only permitted student-visible fields.
7. Atomically persist final results and update progress/awards under the selected policy.
8. Deliver the final result via the existing stream/fetch path.
9. Keep incomplete infrastructure failures distinct from legitimate zero-point answers; support safe retry/repair.

Student-visible sample grading must use the same semantic version. For Python-regex compatibility, use a tested Python matcher in the browser runtime or a clearly identified server sample-check route. Do not substitute JavaScript matching silently. Never send hidden patterns to the browser.

### 10.3 Import behavior

Recognize supported Elice manifest version 0, comparator identifiers, weights, limits, message templates, and referenced input/output files. Map all fields explicitly. Resolve paths inside a bounded archive root; reject traversal, symlinks escaping the root, zip bombs, oversized content, unsupported scripts, and unsupported profile versions.

Code Viewer and STDIO Grader Maker are two authoring representations. Elice documentation warns generated STDIO code may replace an existing grader. Cove should preview that replacement and require an explicit author action; do not silently overwrite custom grading bundles.

A grading manifest alone may not contain material-level score policy or environment limits. Require those values from a separate verified source or ask the importer to resolve them; do not infer a universal 100-point cap or 60-second budget from E1.

## 11. Migration and backwards compatibility

Existing exercises remain on `LEGACY_STDIO` with their current normalization, equal-case scoring, and failure rules. Do not retrospectively change old scores when adding Elice-compatible behavior.

Migration sequence:

1. Add nullable/versioned metadata and compatible readers.
2. Backfill explicit legacy profile identity while preserving existing cases and scores.
3. Deploy workers able to understand both old and new snapshot formats before enabling new authoring.
4. Add authoring/import validation and preview against a known solution.
5. Opt selected exercises into the new mode with a grading-revision increment.
6. Regrade historical submissions only through an explicit, audited repair operation.
7. Verify progress, leaderboards, point awards, records, and manual adjustments reconcile.

Rollback disables new-profile authoring and routes unsupported jobs to capable workers; it must not make an old worker guess the meaning of a new profile. Preserve immutable historical profiles for reproducibility.

## 12. Architecture options and recommendation

| Option | Benefit | Limit |
| --- | --- | --- |
| Extend current Pyodide STDIO worker | Smallest change; reuse queue, persistence, streaming | Does not match native process/environment semantics automatically |
| Add isolated native Python worker behind `ExecutionEngine` | Closer to the observed subprocess model and Python regex | Requires sandboxing, operations, and resource enforcement |
| General custom-script platform | Supports broad teacher-authored checks and multi-file work | Largest scope and strongest trust-boundary requirements |

Recommendation: implement versioned STDIO behavior first, with a compatible comparison/scoring kernel and rigorous differential tests. Add an isolated native runner when curriculum/runtime parity requires it. Add audited manual adjustments and custom script support as explicit later milestones; retain them in the grading scope rather than claiming the first milestone covers all of Elice.

This is a development design, not authorization to run untrusted scripts on production or change runtime settings during this research task.

## 13. Compatibility test matrix

Expected outcomes labeled derived below come from inspected source. Execute them on a dedicated Elice test exercise and on Cove before making an exact-equivalence claim. Do not run them against enrolled students' assessment records.

| Group | Required cases |
| --- | --- |
| Same-output | Exact text; final newline; per-line trailing spaces/tabs; leading whitespace; repeated interior spaces; blank interior lines; CRLF/CR; Unicode line separators and whitespace; empty output |
| Contains | Exact match; prefix/suffix; case mismatch; embedded newline; empty expected; empty actual; numeric substring false positives |
| Negative contains | Each positive case inverted; ensure runtime/timeout policy is applied separately |
| Regex | Search versus full match; anchors including final newline; inline flags; dot/newline; Unicode digits; lookaround; backreferences; invalid and empty patterns; catastrophic backtracking budget |
| Weights | 30/30/40 fixture: only third passes → raw 40; first two pass → raw 60; all pass → raw 100; zero-weight case; zero total |
| Soft limit | Correct below/equal/above threshold; wrong above threshold; zero/full penalty; paired-field validation; hard timeout overrides soft warning |
| Continuation | Wrong first case then correct second; timeout first then correct second; process crash first; overall budget exhaustion with remaining cases |
| Exit behavior | Matching stdout then nonzero exit; matching stdout then exception; stderr-only message; caught error; invalid UTF-8 output |
| Environment | stdin EOF; fresh process state; filesystem/import state across cases and users; missing file; excessive output; process descendants; actual memory enforcement |
| Score application | Absolute raw below/equal/above cap; relative scaling and rounding; zero total; excluded material; latest versus best; passing with warning |
| Messages | All six events; blank messages; missing keys; running counters; brace escaping; result-only variables; unknown template syntax; hidden-data probes |
| Manual | Requires prior submission; positive/negative adjustment; bounds; unauthorized actor; concurrent edit; later attempt; automatic regrade interaction |
| Custom script | Function result, structured return, student crash, grader crash, malformed/no score, repeated score messages, forged stdout score, hidden-file access |
| Browser | Run/sample/Submit agreement; correct score owner; queued state; reconnect; final result after dropped stream; no hidden case payload |
| Revision | Author edits while queued; old/new workers; duplicate job delivery; rollback; repair without extra attempt/point award |

For each probe record source exercise/profile, runtime, exact code/input/pattern, expected outcome, observed verdict/raw/applied score/message, and whether it is verified on Elice or only unit-tested locally. Timing boundary tests require tolerances and a controlled clock; tiny observed wall-time differences are not comparator defects.

## 14. Performance and operational acceptance

This feature is about grading semantics, not increasing queue throughput. Weighted cases and continue-after-timeout can increase work. The earlier 50-job diagnostic took roughly 20–25 seconds for the last stored score at concurrency two; it did not measure Elice performance or browser click-to-score.

Before rollout, repeat the staged 1/5/10/50 submission tests on representative new profiles and collect API admission, queue wait, execution, comparator, database, and delivery times separately. Include worst-case bounded regex, multi-case timeouts, and memory exhaustion in staging first.

No compatibility rollout passes if a student can affect another student's runtime, forge a result, expose hidden graders, or strand workers. Queue backpressure, worker recovery, job deadlines, output caps, and database connection limits remain necessary even if the example exercises are cheap.

Do not copy E1's generous 60-second case limit across the whole curriculum. Use measured pedagogical requirements and an explicit total job budget; document any intentional limit difference from imported Elice content.

## 15. Remaining verification register

These are explicit remaining checks, not implied implemented behavior:

| ID | Unknown or partially observed | How to close it |
| --- | --- | --- |
| V1 | Relative-score formula, rounding, clamping, zero-total behavior | Dedicated material with non-100 maximum and weighted partial results |
| V2 | Surrounding platform response to nonzero exit with matching stdout | Safe test submission; compare stored score and terminal verdict |
| V3 | Global timeout interrupted mid-grading: partial score saved or discarded | Dedicated bounded timeout exercise; inspect result/history |
| V4 | Memory enforcement mechanism and descendant cleanup | Controlled test environment/vendor details; avoid stress on live course |
| V5 | Exact runtime/package versions, regex edge compatibility | Record runtime identity and differential Unicode/regex probes |
| V6 | Best/latest/final score, completion, certificates, warnings | Dedicated account with ordered attempts of different scores |
| V7 | Student-role hidden-case, solution, and message visibility | Authorized student test session, not manager-view inference |
| V8 | Manual-score bounds, later submissions, and regrade interactions | Disposable submission plus reversible adjustment workflow |
| V9 | Additional custom grader families used elsewhere in this course | Inventory active entrypoints across remaining exercises; inspect representative variants |
| V10 | Import/export format completeness and maker/code round-trip | Disposable export/import and explicit replacement test |
| V11 | UI min/max validation, multibyte input counter semantics | Unsaved/test-fixture validation probes; do not infer from labels |
| V12 | Broader language/Arduino/GUI grading and backend autoscaling | Separate runtime-specific inspection; not inferred from this Python course |

The observed course includes quizzes, exams, GUI/Pygame projects, and other materials. Their presence in the lecture list does not establish their grading implementation. This document covers inspected Python exercise grading plus documented custom/manual paths; a course-wide claim requires V9 and the relevant runtime probes.

## 16. Completion criteria

Development is complete for a named compatibility milestone only when its schema, authoring, snapshots, runner, scoring, feedback, browser path, imports, repairs, and downstream effects are implemented and tested together. Existing exercises must retain their legacy behavior.

The STDIO milestone must cover all five comparators, weighted scoring, limits/warnings, messages, immutable profiles, and the relevant differential cases. Native/custom and manual milestones have their own explicit checks. Unresolved evidence-register entries prevent an unqualified “100% Elice grading” claim.

The defensible release statement is: “Cove matches the verified Elice grading scenarios listed in this specification on these runtime/profile versions.” Any intentional differences must appear in the import preview, developer documentation, and final verification report.
