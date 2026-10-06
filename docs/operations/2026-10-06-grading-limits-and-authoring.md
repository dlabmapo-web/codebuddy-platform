# Large grading tests and problem authoring

Implementation branch: `fix/auth-google-login-password-recovery`.
These changes are prepared locally; production has not been updated.

## Limits after this release

| Resource | Bound |
| --- | --- |
| Input per case | 8,388,608 characters |
| Expected output per case | 8,388,608 characters and 8 MiB encoded as UTF-8 |
| Combined input and expected output per problem | 16,777,216 characters |
| Encoded authoring request | Below the existing 20 MB edge ceiling, with space reserved for the RPC envelope |
| Captured stdout per case | 8 MiB for new submissions |
| Captured diagnostic stderr | 256 KiB |
| Student source code | 100,000 characters |
| Default per-case execution time / memory | 3 seconds / 256 MB |
| Per-case override | Up to 60 seconds |
| Enhanced total grading budget | Default 60 seconds; configurable from 1 to 300 seconds |
| Infrastructure overhead | 5 seconds beyond the total budget |
| New enhanced comparison budget | 1 second; existing custom budgets remain unchanged |
| Sandbox JSON frame | 64 MiB, allowing JSON escapes within the input/output bounds |

Limits are centralized in the dependency-free
`packages/shared/src/grading-limits.ts` module. Manual authoring, test import,
and sandbox transport agree on the per-field limits. Manual authoring rejects
an oversized aggregate or encoded request. Import planning rejects an
oversized per-problem test collection. Errors reject the data; they do not
shorten it to fit. Workbook upload, expanded ZIP, row, and aggregate cell
limits still apply independently.

New enhanced submissions use policy snapshot version 2 for the enlarged stdout ceiling.
An older worker that only accepts version 1 refuses the new policy instead of
grading it with its smaller hardcoded output cap. Existing
enhanced submissions and public checks keep their recorded output ceiling and
comparison budget. Clipped stdout cannot pass by matching only its captured
prefix: it produces a wrong-output verdict when execution otherwise succeeds.
Runtime errors, time limits, and memory limits retain their existing verdicts.

The authoring editor currently exposes total grading time and per-case time
overrides. The default 256 MB memory budget is set in code; the editor does
not expose a memory control. Comparison budget is stored in the grading
profile; its default is applied to new enhanced profiles, not silently changed
on existing exercises or submissions.

## Before publishing a new problem

1. Write a correct reference solution and run it against **every** case in the
   actual grader. Generate expected output from a verified solution; check it
   independently on small cases where a simple brute-force answer is possible.
2. Validate the complete input. If its first line says `N`, verify that exactly
   `N` items follow. Check value ranges, uniqueness where required, separators,
   and line structure. Recheck the saved data after imports or copy/paste;
   increasing limits cannot recover text that was already lost.
3. Cover the smallest input, ordinary examples, edge cases, and the largest
   supported input. For towers, include ascending, descending, and mixed
   heights. Keep examples public and meaningful edge cases hidden. Check
   weights so that the score reflects the intended learning goals.
4. Benchmark the reference solution with the real Python runtime, using the
   largest case and the whole case collection. Set case overrides and total
   grading time with room for actual execution, runner acquisition, and
   comparison. A fast desktop Python result does not prove that Pyodide and
   the production sandbox will have the same runtime. Verify memory at the
   actual 256 MB budget.
5. Use `STDOUT` for a complete expected answer. In enhanced mode, trailing
   whitespace is normalized, but leading and interior whitespace remain
   significant. Use substring/regex comparison only when it is part of the
   problem's intended rules; test patterns for correctness and bounded runtime.
6. Use the problem editor or authoring API for large test text. Excel permits
   only 32,767 characters in one cell, so its cells cannot represent a complete
   multi-megabyte test. See [Microsoft's Excel specifications and
   limits](https://support.microsoft.com/en-us/excel/excel-specifications-and-limits).
   The platform importer accepting a large XML value does not remove Excel's
   own cell limit. This is a separate limitation; it does not establish the
   cause of the existing 50,000-character truncation.

Limits remain finite. Incorrect inputs, incorrect expected answers, infinite
loops, excessive memory use, and expensive regexes still need appropriate
errors or student verdicts. Enlarging input/output caps prevents the diagnosed
size restriction from rejecting valid full-size tests; it does not validate
arbitrary problem data automatically.

## Verification and release

The integration regression grades a complete 500,000-tower descending input
through a real local Unix-socket sandbox, separate Pyodide runner, and CPython
comparator. It checks the entire output string, not just a prefix. Additional
checks exercise old output ceilings, clipped-output rejection, unsupported
policy ceilings, old sandbox protocols, and oversized fields/collections.
An actual HTTP RPC round trip accepts a complete 8.5-million-character
problem payload and returns a validation error for an oversized case. It
exercises the API transport and schema, without creating production content.
Relevant judge, comparator, authoring, and submission-admission tests passed,
along with the shared and translation suites. API and web typechecks and the
judge-worker build passed. The disposable-database weighted integration suite
and Redis-backed sample-store tests were not run in this environment.

Sandbox protocol 2 is required for the new per-request output ceiling. Update
the sandbox and worker together, with the old worker stopped during the
transition; deploy the API's new authoring/admission defaults after that pair
is ready. An updated worker refuses a protocol-1 sandbox. Do not deploy only
the API or only the worker and assume the larger limit is supported.

The existing tower cases 8 and 9 remain incomplete in production. A full-size
replacement plan is stored privately at
`packages/api/.migration-artifacts/grading/2026-10-06-tower-full-size-repair-plan.json`.
It retains complete original prefix heights, drops the potentially partial
final height, then appends unused descending heights to restore the declared
10,000 and 500,000 items. Expected answers are recomputed and checked against
the original valid prefix. These are newly generated valid fixtures, not a
claim to recover the missing original heights. The plan also sets the
exercise's comparison budget to 1,000 ms.

Both replacement fixtures passed trusted reference code through the real
local sandbox and comparator, at 256 MB and within the existing total budget.
Case 9 produced its complete 3,388,864-byte answer. The plan records source
hashes, expected revision 6, and the expected modification timestamp. It is
owner-readable and gitignored because it contains grading data.

The smaller replacement proposal from the initial investigation is superseded
by this full-size plan. Neither plan has been applied. Recheck the live
exercise revision and progress before publishing, use the normal audited
authoring flow, and keep existing submission snapshots immutable. The normal
authoring flow resets material progress when its grading definition changes;
at the last inspection, its four progress records had zero attempts and zero
best score. Do not infer that this remains true at release time.
