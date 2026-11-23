# QA-005 — Test case limit (50 → 200)

> **Implemented on `qa-feedback` (2026-11-20).** `maxExerciseTestCases = 200` (shared), used by the schema and the answers editor; the workbook import limit and the library-sync note follow it; grading metrics gained `51_100` and `101_200` buckets. **No grading change was needed:** a submission is already bounded by the problem's total time limit (default 60 s, up to 300 s) and test data by `gradingDataLimits` (16 MB per problem, 20 MB per save), independent of the case count. Not done: editor conveniences for long lists (collapsed rows, jump to case).

> Decision (2026-11-20): allow **200** test cases per problem, like Elice.

Registered 2026-11-06 · Sunny · P3

## Request

Some Elice problems have 145 test cases, and Elice stores up to 200. Cove Studio allows 50. In the sheet Brooks and Sunny doubted so many are needed; the decision on 2026-11-20 is to match Elice anyway, so imported problems keep every case.

## Where 50 is set

| Where | What |
| --- | --- |
| [course.ts:764](../../../packages/shared/src/content/course.ts#L764) | `testCases: z.array(exerciseTestCaseDraftSchema).max(50)` — the API refuses more |
| [answers-editor.tsx:31](../../../packages/web/src/app/(studio)/academy/[academySlug]/(framed)/content/courses/[courseId]/lectures/[lectureId]/exercises/_components/answers-editor.tsx#L31) | `MAX_TEST_CASES = 50` — the add button is disabled at 50 |
| [execution-telemetry.ts:19](../../../packages/api/src/judge/execution-telemetry.ts#L19) | metrics buckets end at `11_50`; anything above is `unknown` |

## Implementation plan

1. **One constant.** Export `maxExerciseTestCases = 200` from `@cove/shared` next to the schema, use it in the schema and in `answers-editor.tsx`.
2. **Every path that writes test cases** must accept 200: the problem editor, the workbook/Excel import, library authoring, library sync and course copy. Search for other `.max(50)` or `50` guards on test cases in those paths.
3. **Grading budget.** Cases run one after another under a per-case time limit (default 10 s) and a run-level deadline (`deadline` outcome in [grading.ts](../../../packages/api/src/judge/grading.ts)). Check how the run budget is computed:
   - if it is a fixed total, 200 cases can hit it and the rest are reported as "deadline";
   - size it from the case count (or cap the sum of per-case limits), and keep the queue fair so one 200-case submission does not starve a class.
   Measure on the native grader: a 200-case Python problem with a correct solution, and with a solution that times out on every case.
4. **Payload size.** Each case allows 50,000 characters of input and output. 200 × 2 × 50,000 is about 20 MB per save. Check the API body limit for the save request and the editor's memory with 200 expanded cases; collapse cases by default above, say, 20.
5. **Editor usability.** With 200 cases the list needs: a count in the header (`테스트 케이스 145 / 200`), collapsed rows, and "jump to case N".
6. **Metrics.** Add buckets `51_100` and `101_200` in `execution-telemetry.ts`.

## Tests

- Shared: the schema accepts 200 and refuses 201.
- Web: the add button is disabled at 200, not 50.
- API: saving and grading a 200-case problem passes on the native grader; import of a 145-case Elice workbook keeps all 145.

## Scope

Shared, API (grading budget), web, metrics. No read-path statement change; test cases are already read in one statement per problem.
