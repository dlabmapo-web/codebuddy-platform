# The Point Policy a Manager Can Change

**Date:** 2026-09-07
**Branch:** written on `feat/applicant-lobby`; implementation branch TBD
**Status:** Implemented. §12 records the four places the build departed from
this document and why.

## 1. Purpose

Every academy on the platform runs the same point economy: 3 / 5 / 10 for a
solve, 15 for a lecture, 40 for a module, 150 for a course, 100 a day and no
more. A manager who thinks a hard problem is worth more than three easy ones —
or who runs a curriculum of short modules and finds 40 absurd — cannot say so.

The numbers are not hard-coded. `AcademyPointPolicy` has been a per-academy
table since the points feature shipped, every award already reads it, and the
student's rules panel is rendered from it. What is missing is the one thing
that would make it real: **nothing has ever written a row.** Every academy runs
on the column defaults because there is no endpoint and no page to change them.

This document specifies the manager surface that writes that row: what it may
change, what the numbers may not be allowed to become, and what a change does —
and does not — do to points already earned.

## 2. Diagnosis

### 2.1 The economy is already per academy, end to end

| Layer | Where | What it does |
| --- | --- | --- |
| Type and defaults | `shared/src/points/policy.ts:16,56` | `PointPolicy`, 17 numbers; `DEFAULT_POINT_POLICY` |
| Pure rules | `shared/src/points/policy.ts:81,99,144` | `pointsForSolve`, `learningTiers`, `applyDailyCap` — each takes a policy |
| Storage | `api/prisma/schema.prisma:1985` | `AcademyPointPolicy`, one row per academy, every value a column |
| Read on the paying path | `api/src/points/point-award.service.ts:80` | `policyFor()` — the row, or `DEFAULT_POINT_POLICY` when there is none |
| Read on the student page | `api/src/points/points.service.ts:361` | `rulesFor()` builds `PointRules` from the same policy |

§7.2 of the 2026-08-21 design is the reason this shape exists: one function that
both the page and the awarding service call, so "the page promises 5P and the
server pays 3P" is not a state the product can reach.

### 2.2 Nothing writes the row

`academyPointPolicy` appears in exactly one write in the whole repository, and
it is a delete: `api/src/platform/academy-purge.ts:61`. The table is empty in
production, `policyFor()` takes its fallback branch on every award, and the
column defaults are the economy.

### 2.3 The endpoints were designed and never built

§12.1 of `2026-08-21-student-points-and-class-ranking-design.md` lists them:

```ts
policy: {
  get:    oc.input(academyIdSchema).output(pointPolicySchema),
  update: oc.input(pointPolicyUpdateSchema).output(pointPolicySchema),
},
```

So this is a designed slice being finished rather than a new direction. What
that design did not settle — validation, retroactivity, where the page lives,
what the manager sees before saving — is what §3 below is for.

### 2.4 An award's amount is frozen, and that now shows

`PointAward.amount` (`schema.prisma:1906`) is written once, at earn time. No
sum is ever recomputed from the policy, which is correct — the ledger is a
receipt — and it means every policy change is forward-only.

Yesterday that was invisible. Since
`2026-09-07-all-time-ranking-and-no-class-floor-design.md` made **all time**
the default period, a board spans the whole life of a class, so an academy that
doubles `solveHard` in October has a leaderboard openly mixing two economies
with nothing on screen to explain it. The behaviour is right; the copy has to
carry it (§3.5).

### 2.5 The settings page today has no submit button

`web/.../settings/page.tsx` renders `FeatureSettings`: switches, each one a
request the instant it moves, no form and nothing to save. `switch.tsx:10` says
so as a rule rather than a description.

## 3. Decisions

### 3.1 A page of its own, under settings

`/academy/{academySlug}/settings/points`, added as the second row of the
manager-only settings group in `studio-sidebar.tsx:612` and gated on the
`hasPoints` flag the sidebar already computes (`:559`) — an academy that does
not run points is not offered a page configuring them.

**Not a section on the switches page.** Seventeen numbers with cross-field
constraints need one save (§3.8), and a Save button on a page whose whole design
is "no submit" would break the rule that page is built on rather than bend it.

**Not a panel on the points page.** That surface is what a student and a
teacher read. A manager editing the economy from inside the leaderboard puts a
control over a child's score on the page that shows the child their score.

`activeNavHref` (`web/src/lib/nav-active.ts:12`) already prefers the longest
matching href, so the new row lights alone and `/settings` does not light with
it. No change there.

### 3.2 The contract: `points.policy.get` and `points.policy.update`

Both on the points namespace, beside the reads.

`points.contract.ts:14-33` currently documents the namespace as read-only and
gives a strong reason: no person may grant a point, because a granted point is
a claim about a child's effort the child cannot audit. **That rule is not being
relaxed, and the doc comment must be amended precisely rather than softened.**
The distinction the new sentence has to draw is:

> Nobody may grant a point to a person. What an *action* pays is a setting, and
> a setting is not a grant: it applies to every student equally, before anyone
> has done anything, and it cannot name a child.

Rejected: a new `academySettings` namespace, or hanging it off
`academyFeatures`. The policy is points vocabulary — `PointPolicy`,
`PointRules`, `pointsForSolve` — and `PointAwardService.policyFor` is already
the reader. Splitting the write away from them would put the one thing that
changes the economy in a namespace that knows nothing about it.

**`get` is manager-only**, via `ManagerScopeService.requireManager(identity,
academyId, 'academy.settings.manage')` — the same guard
`AcademyFeaturesService.setEnabled` uses (`manager-scope.service.ts:86`). Every
member can already read what actions pay through `rules` on `points.getPage`;
what `get` adds is the two attendance thresholds, which are operational
settings rather than a promise to a student, and the editor is its only caller.

### 3.3 What a manager may change, in four groups

| Group | Fields | Note |
| --- | --- | --- |
| What work pays | `solveEasy`, `solveMedium`, `solveHard`, `lectureCompleted`, `moduleCompleted`, `courseCompleted` | the request, in one group |
| Attendance | `attendance`, `attendanceLate` | points |
| Being counted present | `attendanceMinMinutes`, `attendanceGraceMinutes` | **not points** — minutes. Own subgroup, own heading. |
| Learning time | three rungs of `minutes` + `points` | a ladder, rendered as one |
| The daily cap | `studentDailyCap` | §3.3.1 |

Every column on the table is editable. A policy with some columns settable and
some not would be a second, undocumented policy.

#### 3.3.1 The cap is per student, per class, per day

`point-award.service.ts:118` scopes `earnedToday` by `membershipId` **and**
`classId` and the academy-local date. A manager reading "daily cap: 100" will
assume it is the student's daily total; for a student in two classes it is 200.
The label says the whole thing, and the hint says what it is for — without it
the board measures endurance rather than learning, which is the schema's own
comment (`schema.prisma:2008`).

### 3.4 Validation lives in shared, as one schema both sides use

`pointPolicySchema` in `shared/src/points/policy.ts`, next to the type it
validates, imported by the contract and by the form. Field bounds:

- every point value: integer, `0 … 1000`
- every minutes value: integer, `1 … 1440`
- `studentDailyCap`: integer, `1 … 10000`

Cross-field refinements, each with a reason:

1. **`solveEasy ≤ solveMedium ≤ solveHard`.** §7.2's argument is arithmetic: if
   easy pays as well as hard, the numbers tell a student that grinding easy
   problems beats attempting a hard one, which is the exact lesson the values
   exist to prevent. Equality is allowed — an academy may flatten the ladder —
   inversion is not.
2. **Tier minutes strictly ascending; tier points non-decreasing.** A ladder
   whose second rung is shorter than its first is not a ladder, and
   `learningTiersReached` returns *every* rung at or below the total, so an
   inverted ladder pays the wrong sum rather than merely reading oddly.
3. **`attendanceLate ≤ attendance`.** Arriving late must never pay better than
   arriving on time.
4. ~~**`studentDailyCap ≥` the largest single award.**~~ Withdrawn during
   implementation: `DEFAULT_POINT_POLICY` violates it — a course completion
   pays 150 against a cap of 100 — so the rule would have rejected the state
   every academy is currently in. It is a **warning** instead, from
   `awardsAboveDailyCap`, shown beside the cap and computed by the function
   that would do the trimming. §12.1.

**Zero is allowed and is not a hole.** An academy that does not want to pay for
attendance sets it to 0, and `write()` already refuses to write a zero award
(`point-award.service.ts:134`). Zero is how a manager turns one reason off
without turning points off.

An emptied box is its own message, `REQUIRED`, decided before the schema runs:
the draft holds strings so that clearing a field to retype it is a state the
form can be in, and an empty box read as `0` would be a policy nobody asked for
that also validates.

No new error code. Authorization reuses `MANAGER_OPERATIONS_ACCESS_DENIED`
(`shared/src/errors/codes.ts:82`); a schema rejection is a contract-level
failure rendered by `useErrorText`, and the form validates with the same schema
before submitting, so the server rejection is the backstop rather than the UI.

### 3.5 Changes are forward-only, and the page says so

Saving affects awards written after it. Existing rows keep the amount they were
paid, so totals, ledgers and every board are unchanged by a save.

This is stated on the page, next to the save button, because a manager will
otherwise assume the opposite — and because all-time boards now make the mixed
economy visible for the life of the class (§2.4).

Rejected: recomputing history. The ledger is a receipt of what a child was told
they earned; rewriting it would change a number a student already read, on a
page whose whole purpose is that they can check it.

### 3.6 "Reset to defaults" deletes the row

Not "write the defaults back". Two consequences, both wanted: the absence of a
row keeps meaning *this academy never chose*, and an academy that never chose
follows any future change to `DEFAULT_POINT_POLICY` instead of being frozen at
today's values by an accident of the reset button.

It follows that the page must never create a row on load. `get` with no row
returns `DEFAULT_POINT_POLICY` and says the row is absent; the first save is
what creates it.

### 3.7 The manager previews the student's own rules panel

`PointRulesPanel` (`web/.../points/_components/point-rules.tsx`) already renders
a `PointRules`. The editor renders it from the **pending** form values, beside
the form, so "what will my students see" is answered without saving.

To make that impossible to get wrong, `rulesFor()`'s policy → rules mapping
(`points.service.ts:361`) moves into shared as a pure
`pointRulesFrom(policy): PointRules`, and the service calls it. Same technique
as `pointsForSolve`, one layer up: the preview and the server cannot disagree
because there is one mapping.

### 3.8 One save for the whole form

Not per-field autosave. The constraints in §3.4 are between fields, so a form
that submits each field as it changes would reject half of every edit in
progress — raising `solveHard` from 10 to 20 by way of `solveMedium` is a
sequence, not a state.

So: local dirty state, a Save that is disabled while pristine or invalid, a
Cancel that restores the loaded values, and per-field messages from the shared
schema. The mutation answers with the saved policy, which replaces the query
data — the same pattern as `FeatureSettings`.

### 3.9 Audit

One `academy.point_policy.updated` row per save, written inside the same
transaction as the upsert, `before` and `after` carrying the whole policy —
mirroring `academy-features.service.ts:129`. The economy of an academy is
exactly the kind of thing somebody asks about three months later.

## 4. What changes, file by file

| File | Change |
| --- | --- |
| `shared/src/points/policy.ts` | `pointPolicySchema` (bounds + the four refinements), `pointPolicyUpdateSchema` (`academyId` + the policy), `pointRulesFrom(policy)`. `DEFAULT_POINT_POLICY` unchanged. |
| `shared/src/api/orpc/points.contract.ts` | `policy: { get, update }`; the read-only doc comment amended per §3.2. |
| `api/src/points/points.router.ts` | three entries under `policy`; the "no third operation" comment at `:7` rewritten. |
| `api/src/manage/point-policy.service.ts` *(new)* | `get`, `update` and `reset`. `update` upserts, audits, returns the saved policy. Filed under `manage/` rather than `points/` — §12.2. `PointAwardService.policyFor` stays the reader on the paying path, now through the shared `pointPolicyFrom`. |
| `api/src/manage/manage.module.ts` | provides and exports the new service. |
| `api/src/orpc/context.ts`, `router.ts` | the dependency, as `academyFeaturesService` is wired. |
| `api/src/points/points.service.ts:361` | `rulesFor` delegates to `pointRulesFrom`. |
| `web/.../settings/points/page.tsx` *(new)* | server component: `requireAcademyRoute`, `canManageAcademySettings` else `notFound()`, feature check, server-side `policy.get` for a form that opens filled in. |
| `web/.../settings/points/_components/point-policy-form.tsx` *(new)* | the form, the live `PointRulesPanel` preview, save / cancel / reset. |
| `web/.../settings/points/_lib/policy-draft.ts` *(new)* | the draft: strings in, a policy or `null` out, plus dirty, equality and the error-key mapping. Extracted so it can be tested — web has no DOM test environment. |
| `web/.../settings/points/layout.tsx` *(new)* | mounts `pointsNamespaces`, which the preview panel needs. §12.4. |
| `web/.../settings/points/loading.tsx` *(new)* | matching the existing settings skeleton. |
| `web/.../_components/studio-sidebar.tsx:612` | second row in the settings group, behind `hasPoints`. |
| `i18n/{en,ko}/points.json` | the `policy.*` subtree (§5), and `nav.json` gains `link.point_policy`. §12.4. |
| `api/prisma/schema.prisma` | **untouched.** The table and its defaults already exist; there is no migration. |

## 5. Copy

`points` namespace, under `policy` (§12.4). Manager-facing, so Korean is formal
(`-습니다`), matching the rest of the settings surfaces.

| Key | English | Korean |
| --- | --- | --- |
| `title` | Points and rewards | 포인트 지급 기준 |
| `description` | What each kind of work is worth in this academy. | 이 학원에서 각 활동에 지급하는 포인트입니다. |
| `group.work` | What work pays | 학습 활동 |
| `group.attendance` | Attendance | 출석 |
| `group.present` | Counting as present | 출석 인정 기준 |
| `group.learning_time` | Learning time | 학습 시간 |
| `group.cap` | The daily limit | 하루 상한 |
| `field.solve_easy` | Easy problem solved | 쉬운 문제 해결 |
| `field.solve_medium` | Medium problem solved | 보통 문제 해결 |
| `field.solve_hard` | Hard problem solved | 어려운 문제 해결 |
| `field.lecture` | Lecture completed | 강의 완료 |
| `field.module` | Module completed | 모듈 완료 |
| `field.course` | Course completed | 코스 완료 |
| `field.attendance` | Present | 출석 |
| `field.attendance_late` | Present, late | 지각 |
| `field.min_minutes` | Counted minutes to be present | 출석으로 인정할 학습 시간(분) |
| `field.grace_minutes` | Minutes after the start still on time | 지각으로 보지 않을 시간(분) |
| `field.tier` | After {{minutes}} minutes | {{minutes}}분 학습 시 |
| `field.cap` | Most one student can earn in one class in one day | 한 학생이 한 반에서 하루에 받을 수 있는 최대 포인트 |
| `hint.cap` | Without a limit the ranking measures how long a student sat there, not what they learned. | 상한이 없으면 순위가 학습량이 아니라 앉아 있던 시간을 나타내게 됩니다. |
| `hint.solve` | A hard problem should be worth more than an easy one, or the numbers tell a student to avoid hard problems. | 어려운 문제가 쉬운 문제보다 높아야 합니다. 그렇지 않으면 학생이 어려운 문제를 피하게 됩니다. |
| `forward_only` | Changes apply from now on. Points already earned keep the value they were given. | 변경한 기준은 지금부터 적용됩니다. 이미 받은 포인트는 그대로 유지됩니다. |
| `preview.title` | What students will see | 학생에게 보이는 화면 |
| `save` | Save | 저장 |
| `cancel` | Cancel | 취소 |
| `reset` | Restore the defaults | 기본값으로 되돌리기 |
| `reset_confirm` | This academy will follow the platform defaults again. | 이 학원은 다시 플랫폼 기본값을 따르게 됩니다. |
| `saved` | Saved. | 저장되었습니다. |
| `error.order_solve` | A hard problem cannot be worth less than an easy one. | 어려운 문제가 쉬운 문제보다 낮을 수 없습니다. |
| `error.order_tiers` | Each rung must be longer than the one before it. | 각 단계는 앞 단계보다 길어야 합니다. |
| `error.order_late` | Arriving late cannot pay more than arriving on time. | 지각이 정시 출석보다 높을 수 없습니다. |
| `capped_warning` | {{names}} pays more than the daily limit of {{cap}}P, so a student receives the limit instead of the full amount. | {{names}}의 포인트가 하루 상한 {{cap}}P보다 큽니다. 학생은 설정한 값이 아니라 상한까지만 받습니다. |
| `following_defaults` | This academy has not set its own values yet, so it follows the platform defaults shown below. | 아직 이 학원의 기준을 정하지 않아 아래의 플랫폼 기본값을 따르고 있습니다. |

## 6. What this trades away

**A manager can now make their own economy incoherent, within the bounds.**
Every value at 0 is legal — it is how a manager turns a reason off — and an
academy that zeroes everything gets boards that never open, showing
`NO_ACTIVITY_YET`, which reads as a fault rather than a choice. The refinements
in §3.4 stop the mistakes that would mislead a *student* (hard paying less than
easy, late paying better than on time); they deliberately do not stop an
academy from choosing a quiet economy. The alternative — a platform-wide
economy nobody may touch — is the complaint this document answers.

**Boards will mix economies.** Over all time, a class ranked in November is
ranked partly on October's numbers. Freezing the amount is the only honest
option (§3.5), so what we can do is say it on the page and no more.

**Numbers change under students mid-term.** A child who was told a hard problem
pays 10 may find it pays 6 next week, with no notification anywhere. Out of
scope here; if it becomes a real complaint, the answer is a note on the student
rules panel when the policy changed recently, not a restriction on the manager.

## 7. Test plan

**Shared, `pointPolicySchema`:**
- accepts `DEFAULT_POINT_POLICY` unchanged — the defaults must be a legal policy
- rejects `solveHard < solveEasy`; accepts all three equal
- rejects tier minutes out of order; rejects a rung paying less than the one below
- rejects `attendanceLate > attendance`
- rejects a cap below the largest single award; accepts one exactly equal
- accepts zeros throughout; rejects negatives, non-integers, and values past the bounds

**Shared, `pointRulesFrom`:** returns exactly what `rulesFor` returned before,
for the defaults and for a custom policy — the guard on §3.7's refactor.

**Service:**
- `get` with no row returns the defaults and reports the row absent
- `get` with a row returns the row
- `update` creates the row on first save, updates it on the second
- `update` writes one `academy.point_policy.updated` audit row carrying before and after
- a Team Lead and a teacher are refused with `MANAGER_OPERATIONS_ACCESS_DENIED`
- another academy's id is refused the same way
- after `update`, `PointAwardService.policyFor` returns the new values, and an
  award written afterwards pays them while one written before is unchanged

**Web** — `_lib/policy-draft.spec.ts`, since the package has no DOM test
environment and the behaviour worth pinning is the draft, not the markup:
- a policy survives the round trip through the boxes it is typed in
- an empty box is not read as a zero, and neither is `-` or `1e`
- a deliberate zero does survive it
- `isDirty` against the loaded values; `samePolicy` by value, not identity
- `policyErrorKey` names the broken rule for a cross-field rejection and sorts
  a bound into the side it fell off

Not covered, and knowingly: that Save is disabled until the draft is dirty and
valid, and that the preview follows the pending values. Both are one line in a
component that cannot be mounted in this test setup.

## 8. Rollout

No migration: the table, its columns and its defaults already exist, and the
absence of rows is the pre-existing state `get` is specified to serve (§3.6).

API before web, the usual order — the page calls two endpoints that do not
exist yet. An older client is unaffected: it calls neither, and every read path
already tolerates both a present and an absent row.

Nothing to backfill, and nothing to recompute. No existing point award, balance
or board changes when this ships; the platform's behaviour is identical until a
manager saves something.

## 9. What this supersedes

`docs/superpowers/specs/2026-08-21-student-points-and-class-ranking-design.md`:

- **§7.1** — the table of defaults becomes the *seed* rather than the economy.
  Its values are unchanged and remain what a new academy starts with.
- **§7.2** — the 3 / 5 / 10 argument is no longer a fixed fact about the
  product; it becomes an invariant we *enforce the shape of* (§3.4.1) and a hint
  we show the manager, which is the strongest form it can take once the numbers
  are theirs.
- **§12.1** — the two `policy` endpoints named there are specified concretely
  here: manager-only on both sides, one whole-policy update, no partial patch.

The read-only doc comment on `points.contract.ts` is amended, not withdrawn:
§3.2 states the distinction it must now draw.

## 10. Explicitly out of scope

**Granting points to a student by hand.** Still refused, for the reason
`points.contract.ts` already gives: a granted point is a claim about a child's
effort that the child cannot audit, and it turns the board into a record of a
teacher's opinion. Effort is recognised through `TeacherFeedback`, written to
the child rather than to the scoreboard. Configuring what an action pays is not
the same act and does not open the door to this one (§3.2).

**`voidAward`.** The manager-only correction of a platform mistake, designed in
§7.6 and §20 of the 2026-08-21 document and also unbuilt. It belongs to the
ledger rather than the policy, and it needs its own decisions about what a
voided row looks like to the student who earned it.

## 11. Implementation order

1. **shared** — `pointPolicySchema`, `pointPolicyUpdateSchema`,
   `pointRulesFrom`, contract entries, unit tests. Nothing calls them yet.
2. **api** — `PointPolicyService`, router entries, `rulesFor` delegating to
   `pointRulesFrom`, service tests. Deployable alone; changes no behaviour.
3. **web** — the page, the form, the preview, the sidebar row, i18n. Ships after
   the API.

## 12. Where the build departed from this document

### 12.1 The cap rule became a warning

Specified as a refinement in §3.4; the defaults fail it. A course completion
pays 150 with a cap of 100, and has since the feature shipped, so the rule
would have made the platform's own economy unsaveable and the editor unable to
save the state it opens in. `applyDailyCap` truncates rather than skips, so the
award still lands — smaller than the number typed. The editor says so beside
the cap instead, from `awardsAboveDailyCap`.

### 12.2 The service lives under `manage/`, not `points/`

`TeachModule` imports `PointsModule` for the award service, and `ManageModule`
imports `TeachModule`. A points-side service needing `ManagerScopeService`
would have closed that ring. It sits beside `AcademyFeaturesService` instead,
which is the same act by the same role on the same settings page; the contract,
the router entry and every schema stay in points vocabulary.

### 12.3 There are three operations, not two

§3.6 asks reset to delete the row, and §12.1 of the 2026-08-21 design named
only `get` and `update`. Expressing a delete as `update` with a null payload
would hide a destructive act inside the shape of an ordinary save, so `reset`
is its own operation, with its own audit action.

### 12.4 The copy lives in `points`, not `content`

`content` is a layout namespace: thirty manager-only strings there would ride
in the RSC payload of every page a student opens, which is the trade the
payload budget asks the next feature not to make. The page mounts
`pointsNamespaces` regardless, because the preview is the student's own rules
panel. The nav row's label is the one exception — it belongs to `nav`, with
every other row.
