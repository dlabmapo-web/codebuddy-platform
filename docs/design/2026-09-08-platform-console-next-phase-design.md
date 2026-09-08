# The Platform Console, Next Phase — A Plan, Not a Feature

**Date:** 2026-09-08

**Branch:** `feat/cove-studio-v2`

**Status:** Proposed — a roadmap. Nothing here is buildable as written.

**Extends:** [Platform administration — authority and the academy lifecycle](2026-08-18-cove-v2-platform-administration-design.md),
whose §1.2 deferred list this document picks back up.

## 1. Purpose

The console at `/admin` was built to do one thing: bring an academy onto the
platform and control its lifecycle. It has since grown a user directory, an
audit viewer, support grants, a shared library, and cross-academy content
lenses — each of them arriving on its own, each correct on its own.

What has never been written down is what the console is *for* now that it is
more than a lifecycle tool, and which of the things an operator cannot do are
deliberate, which are unfinished, and which are merely unlinked.

This document is that. It classifies every known gap, fixes the decisions that
every later admin document inherits, orders the work, and settles the four
structural questions that decide the console's shape. It specifies no schema, no
contract, and no route. Each workstream in §5 gets its own design document before
any of it is built, and §7 says what those documents must contain.

One rule governs how it was written, and it should govern the child documents
too. **Where a design document and the codebase disagree, the codebase wins.**
Several decisions recorded in earlier documents were made differently in the
build, and in more than one case the build was right — §2's evidence table is
read from the code, and §8's answers follow it rather than the documents that
predate it.

### 1.1 In scope

| # | Concern |
|---|---|
| 1 | A vocabulary for the three kinds of gap the console has, because they cost different amounts |
| 2 | The decisions that bind every later admin surface, so each one is not re-argued |
| 3 | The workstreams, each named and scoped to one later document |
| 4 | A build order, and the reasoning behind it |
| 5 | Answers to the four structural questions the above raises, taken from the code rather than from earlier documents |

### 1.2 Explicitly not in scope

- Any data model, contract, permission, or route. Those belong to the child
  documents, which can then be reviewed against a decision already made here.
- Anything about the studio. The console's relationship to it is decided in
  §4.1 and §4.2; the studio's own surfaces are not this document's business.
- Plans, seat limits, and billing. Named in the 2026-08-18 deferred list and
  still deferred — nothing about the platform's commercial shape is settled
  enough to design against.

## 2. What exists today

| Fact | Evidence |
|---|---|
| The console rail carries four groups: Platform, People, Content, Operations | `packages/web/src/app/(platform)/admin/_components/platform-sidebar.tsx` |
| The studio rail carries Settings, Point policy, and a My Page row the console has none of | `packages/web/src/app/(studio)/academy/[academySlug]/(framed)/_components/studio-sidebar.tsx:459` |
| An operator standing as `MANAGER` already holds `academy.settings.manage` | `packages/api/src/authorization/academy-access.service.ts:325` |
| …and `ManagerScopeService` accepts that operator like any manager | `packages/api/src/manage/manager-scope.service.ts:92` |
| `/account` is documented as the operator's own page, and nothing links to it | `packages/web/src/app/(studio)/academy/[academySlug]/(framed)/me/page.tsx:20` |
| `platform.features.manage` is declared and enforced nowhere | `packages/shared/src/auth/roles.ts:134` |
| `platform.health.read` is declared and enforced nowhere | `packages/shared/src/auth/roles.ts:136` |
| `platform.organizations.manage` is declared and enforced nowhere | `packages/shared/src/auth/roles.ts:47` |
| `platform.library.distribute` is declared and enforced nowhere | `packages/shared/src/auth/roles.ts:163` |
| Grading already runs on BullMQ over Redis, with streamed job progress | `packages/api/src/judge/judge.queue.ts` |
| Invitation delivery already records what the provider did with each message | `packages/api/src/manage/invitation-delivery.service.ts`, `delivery-webhook.controller.ts` |
| Which rail row is lit is reconstructed from a `from` parameter, per surface | `packages/web/src/app/(platform)/admin/_lib/content-view.ts` |
| The rail group already named **Operations** holds Support access and Audit trail | `packages/i18n/src/locales/en/platform.json:174` |
| The organization is a deliberate singleton, resolved from env and created on first use | `packages/api/src/platform/platform-organization.ts`, `env.schema.ts:136` |
| The console already runs the platform's most destructive academy-scoped operation, from its own academy row | `packages/web/src/app/(platform)/admin/_components/academy-row-actions.tsx:224`, `platform/academy-purge.ts` |
| Every submission records the `gradingRevision` it was graded against; the problem holds the current one | `packages/api/prisma/schema.prisma:1420,1516,1652` |
| Point awards are already idempotent across a re-grade, by design | `packages/api/src/points/point-award.service.spec.ts:211` |
| The judge already self-heals: stale `QUEUED` is requeued, stale `RUNNING` is errored `WORKER_LOST` | `packages/api/src/judge/grading.service.ts:246`, `judge.main.ts:74` |
| Liveness and readiness endpoints exist, for container probes | `packages/api/src/app.controller.ts`, `packages/shared/src/health.ts` |
| Prometheus, Alertmanager, Grafana, node-exporter and cAdvisor run in production, on loopback | `docs/operations/deployment-guide.local.md:38,540` |
| Nothing anywhere can trigger a re-grade | no `regrade`/`rejudge` identifier in `packages/*/src` |

Four declared permissions with nothing behind them is the important row. They
are not oversights — the 2026-08-18 document reserved them on purpose, so that
"the contracts and permission list below leave room for them rather than having
to be reshaped later." That room is still there and still empty.

The last five rows are the ones that change this plan, and none of them is
written down anywhere else. Re-grading is *modelled end to end* and cannot be
started; the judge already recovers from crashes without telling anybody; and
the platform already has a full metrics stack that no design document mentions.
§8 is answered from these rows rather than from the documents that predate them.

## 3. Three kinds of gap

Almost every complaint about the console reduces to one of three shapes, and
naming them is most of the work, because they cost wildly different amounts and
are constantly mistaken for each other.

### 3.1 A navigation gap — the route exists, the rail does not point at it

The operator can already do the thing. Nobody told them where it is.

Academy settings and the point policy are both this. An operator who presses
**Enter academy** as a Manager reaches `/settings` and `/settings/points` and
may change both, today, with no code change at all (§2, rows 3 and 4). My Page
is this too: `/account` exists and is documented as the operator's address.

Cost: a link. The risk in this class is not building the wrong thing, it is
*failing to notice* that a gap is only this — and answering it with a new page
that duplicates authority the operator already had.

### 3.2 A surface gap — the authority exists, no console screen asks for it

The platform can already do the thing, through a service, a seed, or a shell.
No screen offers it.

Re-grading a set of submissions is this. So is answering "is grading stuck."
The queue is real, the worker is real, and the only interface is a terminal on
the server.

Cost: a page and a contract over machinery that already works. Moderate, and
usually the best value on the board, because the hard part is already built and
running in production.

### 3.3 A capability gap — the permission is declared, nothing implements it

The four permissions in §2. There is no service, no contract, no page.

Cost: a full vertical slice. This is where the design documents are genuinely
needed, and where an unwritten one shows up later as a schema migration.

## 4. Decisions

These bind every later admin document. A child document that wants to depart
from one of them says so and argues it; it does not quietly differ.

### 4.1 The console asks cross-academy questions; the studio asks about one

This is the whole difference between the two products, and it is the test to
apply whenever a console page looks like a studio page.

A manager's settings page answers *what does my academy have switched on*. An
operator's switchboard answers *which academies have points on* — one grid,
academies down the side, features across the top, and the answer visible without
opening anything. Same table underneath, and a completely different page.

The corollary is a rule: **no console page is a clone of a studio page.** If the
console genuinely needs the studio's exact page for one academy, it does not
copy it — it sends the operator into the academy (§4.2). A page that reads the
same as its studio twin is a sign the question was never identified.

### 4.2 Acting inside one academy stays a walk into it

`enterAcademyAs` is the mechanism, and it stays the mechanism. The console does
not grow a second set of forms for editing one academy's curriculum, roster, or
settings. Those forms exist, they are the ones the academy's own staff use, and
an operator standing in a role uses the real thing rather than an
administrative near-copy that drifts from it.

This is also why §3.1 gaps are answered with a link rather than a page.

### 4.3 Every operator action is attributable, and says so before it runs

Two halves, and they are not the same.

Attributable: the action lands in `AuditLog` with the operator, the target, and
what changed. This is settled practice and every child document simply names
its audit vocabulary.

Traceable: an action that dispatches background work must carry an identifier
through to that work, so a console click can be found in a worker's logs when
somebody asks what happened at 14:20. Nothing carries one today. A child
document introducing queued work specifies where the identifier is minted and
what it rides on.

### 4.4 A destructive operation states its blast radius on the page

Not in a tooltip and not in a confirmation dialog alone. The page itself says,
in a sentence a tired person reads correctly at the end of a shift, what will
be changed, what will not be, and what does not come back.

An operator surface is used rarely, under pressure, by someone who has not read
the code. The copy is the safety mechanism, and it is designed, not written
afterwards.

### 4.5 The two rails should be derived from one description of the product

Today the console rail and the studio rail are two hand-maintained lists that
happen to agree, plus `routes.ts`, plus a per-surface mechanism for working out
which row to light from a `from` parameter. That they *stopped* agreeing — the
console losing My Page — is exactly the failure this shape produces.

The intended end state is one declaration per route (id, address, icon, its
parent, its parameters) with both rails, the active-row rule, and the back links
read off it.

This is a direction, not a licence. The nav code carries an unusual amount of
reasoning about *why* each row sits where it does, and a registry that flattens
that reasoning into a config table would be a net loss. §5.F says what has to be
true before it is attempted.

### 4.6 Nothing here gives an operator a student's seat

`platformViewRoles` excludes `STUDENT` and `platformViewPermissions` strips
`submissions.own.create`. No workstream in §5 widens either. An operator may
read a student's work and may re-grade it; they may never produce it.

## 5. The workstreams

Each becomes its own design document. The paragraph here is the brief for that
document, not a summary of its conclusions.

### 5.A Rail parity — closing the navigation gaps

Every §3.1 gap at once: the console's academy detail page pointing at that
academy's settings and point policy, and the operator's own My Page row in the
console rail. The brief is to find *all* of them rather than the three that were
reported, by walking the studio rail against the console rail and asking of each
row whether an operator has an equivalent question.

The smallest workstream, and the only one that may reasonably be a single change
without a document of its own.

### 5.B An operations console — queued maintenance work

A page of maintenance operations an operator can run: re-grade a problem's
submissions after a test case is corrected, recompute point balances after a
policy change, rebuild a ranking, retry a failed import. Each dispatched onto
the existing queue, each stating its blast radius per §4.4.

The brief must settle: which operations exist and which are deliberately absent;
how progress and completion are reported back; and what happens when two
operators start the same operation at once. §4.3's identifier is introduced
here, and §8.3 has already decided where these operations live.

Smaller than it looks, and the reason is worth stating so the child document
does not re-derive it. Re-grading is modelled end to end already: `Problem`,
`Submission` and `StudentExerciseProgress` each carry a `gradingRevision`, so
"which submissions are stale" is a comparison rather than a new column; point
awards are deliberately keyed to exclude the revision so a re-grade cannot pay
twice; and the import planner's idempotency rules exist precisely to avoid
triggering one by accident. Every consequence of re-grading has been thought
through. Only the trigger is missing.

### 5.C The stuck list — work that needs a human

Named "health" in the 2026-08-18 deferred list, and that name should now be
dropped, because the platform's health is already somebody else's job.
Prometheus, Alertmanager, Grafana, node-exporter and cAdvisor all run in
production; `/health` and `/health/ready` already answer the container probes;
and the judge already recovers from its own crashes, requeueing stale `QUEUED`
work and marking stale `RUNNING` work `WORKER_LOST` without anyone watching.

A queue-depth chart in the console would therefore be a worse copy of a Grafana
panel that exists, guarded by a permission, behind a login, for an audience of
one. **§5.C must not build one.**

What none of that infrastructure can answer is the domain question, because it
is a question about rows rather than about processes: which submissions ended
`ERRORED` and never got a verdict, which are stale against their problem's
current `gradingRevision`, which invitations the provider bounced. The brief is
a *work list* — the things that need a person, each with the action that
resolves it — not a dashboard. Its permission is `platform.health.read`; its
shape is closer to the audit trail than to Grafana.

Depends on nothing, but reads better after 5.B, because most rows on that list
are resolved by an operation 5.B introduces.

### 5.D The feature switchboard

`platform.features.manage`, and the first item on the 2026-08-18 deferred list.
The cross-academy grid of §4.1. The brief must resolve how it relates to the
per-academy toggles a manager owns — whether the operator's switch overrides,
seeds, or merely mirrors what the academy may then change — because that is a
question about authority, not about a screen, and getting it wrong is a
migration.

### 5.E Library distribution

`platform.library.distribute` — head office publishing a course into an academy,
which then owns its copy and may edit it. The brief must settle what a copy
inherits, what happens to it when the original changes afterwards, and how an
academy is told that what it is looking at is a template it does not own.

The largest of the workstreams and the one most entangled with content
versioning, which already exists and has its own rules.

### 5.F The route registry

§4.5's end state. The brief is unusual: it must first demonstrate, against the
current nav code, that a declarative registry can carry the reasoning that lives
in those comments — and if it cannot, the honest output of that document is
"not worth it," recorded, with the two rails left alone.

Attempted only when something else is already opening both rails. It is not a
standalone project.

### 5.G Console ergonomics

The operator's working posture rather than any capability: keeping a list on
screen while one row is inspected, faceted filters and a chosen column set on
the tables an operator lives in, a retry on a failed row where retrying is what
one always wants.

Deliberately last as a named workstream, and deliberately allowed to arrive
piecemeal inside the others — a retry action shipped with 5.B is better than a
retry action waiting for an ergonomics document.

## 6. Build order

| Order | Workstream | Why here |
|---|---|---|
| 1 | 5.A Rail parity | Answers three live complaints at the cost of a few links, and until it lands every conversation about the console is confused by them |
| 2 | 5.B Operations | The best value on the board: the queue and worker already run in production, and this is the only workstream that removes work currently done over SSH |
| 3 | 5.C Health | Cheap once 5.B has established how the console talks about queued work, and it is what makes 5.B's failures legible |
| 4 | 5.D Switchboard | The real answer to "an admin should be able to do settings," and worth doing only after 5.A has proved that the cheap reading of that request was wrong |
| 5 | 5.E Library distribution | Largest, most entangled, and the least often asked for |
| — | 5.F Registry | Not scheduled. Taken up opportunistically, under §5.F's own precondition |
| — | 5.G Ergonomics | Not scheduled. Shipped inside the workstreams above wherever it belongs |

The order is by value over cost, with one deliberate exception: 5.A goes first
although it is the least interesting, because a misdiagnosed gap is expensive
and 5.A is what makes the diagnosis visible.

## 7. What each child document must contain

Beyond the house shape already set by the 2026-08-18 document, each admin design
document states:

1. **Which gap class it closes** (§3), and the evidence. A document that cannot
   name its class has not finished thinking.
2. **The question the surface answers**, in the words of the person who asks it.
   §4.1 is applied here or nowhere.
3. **Its audit vocabulary**, and — where it queues work — where §4.3's
   identifier is minted and what carries it.
4. **The blast-radius copy** for every destructive operation, as designed text,
   not a note that copy is needed.
5. **What it deliberately does not do**, so the next document knows what is
   still open rather than inferring it from silence.

## 8. The four structural questions, answered

These were drafted as open questions. They are answered here instead, because
the codebase has already answered three of them in practice and the fourth is
answered by infrastructure that no design document had noticed. Each answer
names the evidence, so a later document can overturn it by producing better
evidence rather than by preferring a different opinion.

Where a comparison helps, it is to `docquery`'s admin — a console of the same
shape, further along, whose worker patterns Cove has already borrowed once
(`judge.queue.ts` says so in its own comment).

### 8.1 One product. Re-cut the rail by authority, and rename a group

**Answer: one product.** Cove has exactly one platform authority tier —
`PlatformRole.ADMIN` — plus time-limited support grants. There is no second
audience, so there is no second product, and splitting the console would create
a boundary nothing enforces.

`docquery` looks like a counter-example and is not. Its rail has three sections
— Dashboard, Settings, Superadmin — and the cut is **by scope of authority**:
what an org admin may touch, what configures their org, and what only a system
owner may see across orgs. Notably it does *not* separate "maintenance" from
"administration": its Operations page sits inside Settings, next to the general
org form. Cove has no cross-org tier to separate off, so it inherits the
principle and not the three sections.

The real problem the question was circling is a **naming collision**, and it is
live today. The rail's fourth group is already called *Operations* and contains
*Support access* and *Audit trail* — which are not operations in the sense 5.B
and 5.C mean. Those two rows are about the operator's own authority and the
record of how it was used.

The recommendation, to be applied by whichever of 5.A or 5.B lands first:

| Group | Holds | Question it answers |
|---|---|---|
| Platform | Academies | Who is on the platform |
| People | Users, Applications, Invitations | Who are the people |
| Curriculum | Library, Academy courses, Classes, Ranking | What is being taught |
| **Accountability** *(renamed from Operations)* | Support access, Audit trail | What did operators do, and under what authority |
| **Operations** *(new)* | Maintenance operations, the stuck list | What needs doing, and what is not working |

One product, five groups, each a question rather than a noun. The renamed group
takes the honest name for what it already holds, which frees the word for the
work that is actually operational.

### 8.2 No workstream for organizations. Retire the permission, or annotate it

**Answer: no workstream, and the permission should stop being dead code.**

The codebase has decided this more firmly than the 2026-08-18 document did.
`platform-organization.ts` is unambiguous: *"One organization for the whole
platform, not one per academy"*, resolved by `PLATFORM_ORGANIZATION_SLUG` from
the environment and created on first use, with a title-cased placeholder name
the comment describes as *"a placeholder nobody reads until orgs surface."*
Every academy is created inside that singleton. There is no second organization
in any environment, and no code path makes one.

So `platform.organizations.manage` is not merely unimplemented — it guards a
concept the system deliberately does not have. A declared permission that can
never be granted anything is worse than an absent one, because the next reader
takes it as evidence of a plan.

Either remove it, or leave it with a comment naming the condition under which it
becomes real. The condition is concrete and worth writing down: **a second
organization exists** — a franchise with branches that must be grouped and
reported on together, which the file already anticipates as *"a re-point of
`organizationId` rather than a merge of throwaway rows."*

`docquery` shows what that day looks like, and it is a large day, not a page:
an org switcher in the sidebar header, `session.org.id` stamped onto every
queued job, per-org resources throughout, and a superadmin tier above it all.
That is a re-shaping of the product, and it should be triggered by a real second
customer rather than by a permission string that already exists.

### 8.3 Academy-scoped operations live in the console. The line is *whose job*

**Answer: the console, scoped by an academy selector — and this is settled
practice, not a new decision.**

The console already runs the most destructive academy-scoped operation the
platform has. Deleting an academy calls `purgeAcademy`, an explicitly ordered
deletion across roughly every table the academy owns, and it is invoked from
`academy-row-actions.tsx` — from the console's own list, behind a dialog that
states the stakes in numbers and requires the academy's slug typed back. Nobody
enters the academy to do it. That precedent decides the question.

§4.1 and §4.2 do not actually conflict once the right test is applied. It is not
*how many academies does this touch* — it is **whose job is it**:

- **The academy staff's own job** — editing a course, seating a member, changing
  a setting. The operator walks in and uses the real page (§4.2). This is why
  5.A closes those gaps with links.
- **The operator's job** — something the academy's staff cannot do, should not
  do, or has no page for: purging, re-grading a corrected problem across a
  cohort, recomputing balances after a policy change. The console, scoped by a
  selector.

`docquery` reaches the same place by a different route: its Operations page
never asks which org it applies to, because the current org context supplies it,
and the action stamps `orgId: session.org.id` onto the job. Cove's operator has
no ambient academy, so the scope has to be explicit — an academy selector on the
operation, and where an operation could reasonably mean "all of them", that must
be a deliberate choice on the page rather than the default that happens when the
selector is left alone.

### 8.4 The console watches the work, not the machines

**Answer: the console does not get a health dashboard, and §5.C has been
re-scoped accordingly.**

The premise of the original question — *nothing watches whether the console's
own reads are answering* — is false, and no design document says so. Production
runs Prometheus, Alertmanager, Grafana, node-exporter and cAdvisor, bound to
loopback and reached by SSH tunnel. `/health` and `/health/ready` answer the
container probes, and a failed readiness check already rolls a deploy back. The
judge recovers from its own crashes without a human: `sweepStale` requeues
`QUEUED` work orphaned past its threshold and marks stale `RUNNING` work
`WORKER_LOST`.

Machine health is covered. Rebuilding a thin version of it inside the console —
behind a login, for one person, without alerting — would be a downgrade wearing
the word "health".

What is genuinely unwatched is not a machine, it is **work**: an `ERRORED`
submission nobody will ever look at, a submission stale against its problem's
`gradingRevision` after a test case was corrected, an invitation the provider
bounced. Grafana cannot answer those, because they are questions about rows and
about a domain, and answering them needs the thing Grafana lacks and the console
has — the ability to *act* on the row.

Hence the rename in §5.C from "health" to "the stuck list". It reports what needs
a person and offers the action that clears it. `platform.health.read` keeps the
name it was declared with; the surface does not.

The one thing this leaves genuinely open is **alerting**: everything above is
pull, and an operator only sees a stuck list when they open it. Alertmanager
exists and already has a delivery path. Whether a domain condition — *forty
submissions errored in an hour* — should reach it, or should stay a thing
somebody notices, is not decided here. 5.C states its position; it is the only
question in this section that its child document may still answer either way.
