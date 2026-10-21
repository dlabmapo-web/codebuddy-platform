# DLAB SSO demo academy workflow verification

Verified the local manager, teacher, and student journey using real DLAB OS sign-ins on 2026-10-21. A newly created class now contains a published Python course, an assigned teacher, an enrolled student, graded code submissions, and a reviewed written response. Three defects found during the journey were corrected and checked in the browser and focused tests.

## Environment and demo resources

- Branch: `feat/dlab-os-staff-sso`, starting from `784b73b9`.
- Studio: `http://localhost:3000`; API: `http://localhost:4000`; existing judge health endpoint: `http://127.0.0.1:4101`.
- DLAB OS provider: `https://os.dlabcampus.com/v1` with the local `/sso/callback` registration.
- Database: the user-confirmed development Supabase project `lnrmxjxsjxymgphgatwn`. No production deployment or production database changes were made.
- Academy: **Daechi SSO Demo Academy**, slug `daechi-sso-demo`.

| Resource | Value |
| --- | --- |
| Class | SSO Workflow Class — 2026-10-21 |
| Class ID | `1703c02f-0f50-42f0-94d0-21fa300a12ac` |
| Course | SSO Workflow Python — 2026-10-21 |
| Course ID | `e739aa88-561c-4d01-8bf9-018dbdfcaa63` |
| Module and lecture | 01 · Python basics / 01 · Input and addition |
| Code exercise | Add two integers, `dd435e01-3377-4fba-ac73-ac78e30a2776` |
| Written response | Explain your addition solution, `2f9b21ff-7f6b-4d7e-9663-1c5470fe541d` |

The existing three members were used without changing their OS identities or assigning roles directly in the database. 김리더 signs in as OS `lab_head` and receives Cove **Manager**; 김선생 signs in as OS `tutor` and receives **Teacher**; T민준 receives **Student**. The HQ account label “team leader” does not change the verified `lab_head` role returned by OS. Credentials remain private and are not included here.

## Browser results

| Actor | Workflow | Observed result |
| --- | --- | --- |
| Manager | Create course, module, lecture, and code exercise | Saved successfully with one public case and one hidden case |
| Manager | Publish curriculum | Course, module, lecture, and exercise visible after publishing each level |
| Manager | Create class and assign its course | One active class with the new course |
| Manager | Assign teacher and enroll student | 김선생 as homeroom teacher; T민준 on the roster |
| Manager | Set class time | Wednesday 16:00–18:00 persisted |
| Manager | Author written response | Published, teacher graded, included in score, maximum 100 |
| Manager | Read overview and audit activity | Class, teacher, participation, completion, and class changes displayed |
| Manager | Archive and restore the test class | Archived warning and disabled editing appeared; restore returned it to Active with teacher, course, student, schedule, and records retained |
| Teacher | Real OS login | Teacher navigation and assigned class available |
| Teacher | Open course | Read/practice controls available; curriculum creation controls absent |
| Teacher | Public test run and private submission | Correct output; private practice accepted at 100/100, 2/2 cases |
| Teacher | Practice history | Own practice attempt visible; student initially remained at zero attempts/progress |
| Teacher | Observe student work | Saved subtraction code and latest failed score visible; editing disabled after the student left the exercise |
| Student and teacher | Request help, claim, resolve | Waiting → helping by 김선생 → resolved; student later saw “Help marked resolved” |
| Student | Real OS login | Correct academy, assigned class, course, and teacher displayed |
| Student | Incorrect code, save, refresh | Draft restored; public Test run displayed expected `5` versus actual `-1` |
| Student | Submit incorrect solution | 0/100, 0/2 cases; public diagnostic visible and hidden case values withheld |
| Student | Interactive Python Run | Typed `10 25`; program printed `35` |
| Student | Submit corrected solution | Accepted, 100/100, 2/2 cases |
| Student | Answer history and review | Two code submissions, one solved problem, 50% accepted rate; accepted result reopened |
| Student | Points | 100 points with the daily cap; ledger showed problem, lecture, module, and course awards |
| Student | Open member management directly | Denied with “You are not an active manager of this academy” |
| Teacher | Solution status and code review | Solved, best score 100, two attempts; immutable submitted-code review opened |
| Student | Save and submit written answer | Draft survived refresh; submission awaited teacher review |
| Teacher | Publish written review | 90/100, completed, feedback saved, review history version 1 |
| Student | Read written review | Exact published score, completion, and feedback visible |
| Student | Course and overview completion | Both show 2 of 2 complete after the reporting correction |

The course was first completed while it contained only the code exercise, earning the completion awards. Adding the written response then increased its denominator to two. Earned points remained intact, and completing the written response brought course progress back to 100%.

## Corrections

1. **Pending practice looked rejected.** Queued/running result snapshots reached the verdict renderer, which treated them as a final failure. Nonterminal states now retain the grading presentation and show an unfinished score instead of a provisional zero.
2. **Negative constraints lost their minus sign.** Removing optional list markers also removed the minus from `-1000000`. A hyphen is now removed only when followed by list-marker whitespace. Verified the negative bound on the student workspace.
3. **Overview omitted completed written work.** Its course denominator included written activities, but its completion lookup received only programming material IDs. It now reads completion for the authorized course materials while keeping coding-attempt statistics separate. Verified 2/2 and 100% on the overview after the teacher review.

Validation: **19 Studio tests and 6 API tests passed**, API and Studio TypeScript checks passed, changed Studio files passed ESLint, and `git diff --check` passed. These are focused regressions plus real browser journeys; the full repository suite was not rerun.

## Repeat the demonstration

1. Keep the local API, Studio, authenticated Redis, and judge worker running with the prepared private development environment. Open `http://localhost:3000/sso/start`.
2. For each account change, sign out of Cove first, start a new SSO flow, then choose the intended OS account. Use **Log in with another account** when OS offers a different saved account. Avoid multiple unfinished SSO attempts in one browser profile.
3. As **Manager**, open Classes → **SSO Workflow Class — 2026-10-21**. Check the course, 김선생, T민준, and Wednesday time. Courses contains the published code exercise and written response. For a fresh creation demonstration, create differently named resources rather than changing the OS accounts.
4. As **Teacher**, open My classes → the test class. Use Solution status to inspect both code attempts. Open Assessment activities → **Explain your addition solution** to inspect or publish a review. Courses → **Add two integers** opens private staff practice.
5. As **Student**, open My classes → the test class → the course. Open the code exercise, run it with input, and submit. The correct program is:

   ```python
   a, b = map(int, input().split())
   print(a + b)
   ```

6. Open **Explain your addition solution** to see the 90/100 review and feedback. The course and Overview should both show 2/2 complete. Answer records contains the coding attempts; the written activity contains its own submission/review history.
7. Check My points. The displayed daily cap is 100 points. The retained demo total is 100, with its award reasons listed in Point history.

## Coverage boundaries

The live edit and feedback-note controls require the student to be actively working on the same exercise. This run verified saved-code observation, the disabled offline controls, and the complete help-queue lifecycle. Simultaneous two-browser collaborative typing and live notes were not exercised; use independent browser profiles for teacher and student to test those together. Two normal tabs share authentication cookies.

This pass covered the core code and written-response classroom journey. It did not exercise every material type, spreadsheet imports, email delivery, billing, load testing, every campus, or real OS `edu_manager`/`hq_admin` accounts. Earlier SSO role and security automation is recorded separately in [the SSO verification report](2026-10-21-dlab-student-staff-sso-verification.md).

Local screenshots are saved under `/tmp/cove-sso-workflow/`, including manager class setup/restoration, teacher practice/help/progress/review, student wrong/accepted code results, points, written feedback, and the corrected completed overview. Final development database inspection confirmed an active class, one assigned course, one enrolled student, two code submissions, and one written submission. The demo data is retained for inspection, and the manager class page is left open.
