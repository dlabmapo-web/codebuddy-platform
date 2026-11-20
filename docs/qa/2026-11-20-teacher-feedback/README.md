# Teacher QA feedback (선생님 시트) — 2026-11-20

Source: `QA_Feedback_선생님.pdf`, the teacher (선생님) sheet: two items, registered 2026-11-05 to 11-06, both marked "Brooks 검토 OK".

| ID | Sev | Item | Status (2026-11-20) | Plan |
| --- | --- | --- | --- | --- |
| T-02 | P1 | After a student's submission passes, the progress icon in the teacher's live outline stays orange; F5 helps only sometimes | **Fixed**; checked live with the judge worker | [t-02-live-outline-progress.md](t-02-live-outline-progress.md) |
| T-01 | P3 | On "내 반" (Enter My Classes) it is hard to see which classes have students online | **Fixed** with a redesigned class card; checked live | [t-01-active-classes-first.md](t-01-active-classes-first.md) |

## Checked so far

- **T-01:** on localhost, the gangnam-dlab "Enter My Classes" page looks like the QA screenshot. Cards come in server order, and "N online · N solving" use the same colours whether the count is 0 or not.
- **Elice comparison:** Elice's teaching list (`dlab.elice.io/my-courses/library/teach`, read only) shows no live information at all: only period, members and lecture/test counts. Nothing there to copy.
- **T-02:** traced in code (below). A live check needs the judge worker running so submissions are graded.

## Verification for every item

```sh
pnpm --filter @cove/web typecheck
pnpm --filter @cove/shared typecheck   # if shared changes
pnpm --filter @cove/web test <touched spec paths>
pnpm --filter @cove/i18n test          # if locale keys change
```

Check on localhost with a teacher and a student signed in at once (see the S-10 doc for the two-session setup), in Korean and English, light and dark, at desktop width and 390px. Stop the servers started for the check afterwards.
