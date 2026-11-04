# DLAB multi-campus SSO production deployment — 2026-11-04

## Released

`feat/dlab-multicampus-sso` is included in **v2.0.48**, commit `eda0a4e6af2429dc339df0378adb0a5b450d5545`, merged into `feat/cove-studio-v2` before tagging. [Exact-commit CI](https://github.com/dlabmapo-web/codebuddy-platform/actions/runs/41787580045) passed all ten jobs. All eight publication/image-scan jobs and the protected deployment succeeded in [release run 41788710848](https://github.com/dlabmapo-web/codebuddy-platform/actions/runs/41788710848), following human approval with `jurabek10`. Deployment completed at 07:32 UTC / 16:32 KST.

The earlier v2.0.47 attempt never deployed because the upstream scanner download host failed DNS resolution. The verified scanner-install repair and unchanged scan gates are documented in [release preparation](2026-11-04-v2.0.48-release-preparation.md). Neither immutable tag was moved or reused.

API and Studio containers were verified on the exact released SHA. All production services passed health checks; internal and public smoke checks passed again after activation. The private inbound key and existing SSO/BFF/Redis credentials were preserved. No database schema migration was added by this feature.

## Campus activation

Followed the [rollout guide](../operations/dlab-multicampus-sso.md) after deployment:

1. Ran audited mapping/access dry-runs, then linked HQ-confirmed Mapo campus `e2a5b14b-64b0-4e5c-9244-969a24054699` to existing academy `eec3d5ca-cda7-4638-8875-c871e16b5c22` (`dlab-mapo`) and enabled campus SSO. Used the existing active Cove platform operator; no new administrator was created.
2. Verified the private API environment had not changed since backup. Atomically changed only `DLAB_AUTO_PROVISION_CAMPUSES=true`, validated configuration, and recreated only the API. Its health check passed. Runtime retained `DLAB_SSO_ENABLED=true`, campus rollout mode, and `https://os.dlabcampus.com/v1`.
3. Catch-up dry-run found exactly two mapped campuses (Daechi and Mapo), 28 creates and zero slug conflicts. Applied the reviewed plan: 28 academies created, 28 `campus.provisioned` events and 28 `dlab.provision-campus` audit entries.
4. Read-only verification found all **30 HQ campuses active, mapped and SSO-enabled**, with active academy targets. Total ordinary academies: **32**, including unrelated existing academies. A repeated dry-run reported 30 mapped and zero creates.

Future authenticated active HQ campus updates now provision academies automatically under the existing restrictions. Users still enter through verified OS SSO; provisioning adds no class enrollment or course assignment. Locally disabled campuses, inactive sources, suspended academies and user restrictions retain their existing behavior.

## Existing Mapo data

Private before/after snapshots retained every pre-existing identifier:

| Collection | Before | After catch-up | Missing original IDs |
| --- | ---: | ---: | ---: |
| Courses | 29 | 29 | 0 |
| Classes, including archived | 21 | 21 | 0 |
| Academy memberships | 59 | 59 | 0 |
| Materials | 1,438 | 1,438 | 0 |
| Submissions | 3,279 | 3,281 | 0 |

Mapo's academy ID, name, slug and status were unchanged. Course names and material IDs were unchanged. The content-revision fingerprint was **not identical**: six courses increased by a total of 105 revisions between 06:33:05 and 07:35:04 UTC. This exactly matched 105 existing `content.programming_exercise.updated` audit entries in that interval; none were by the rollout operator. Content editing was continuing during rollout. These snapshots demonstrate identifier preservation, not byte-for-byte unchanged course content.

The first real Mapo SSO login added its intended managed membership (59 → 60). Repeated login and refresh retained 60 memberships, one Mapo-primary identity and one Mapo binding; no duplicate was created. The two new submissions were already present before this browser test. This verification did not submit student answers, change grades, run re-grading or save curriculum edits.

## Live browser verification

Used the existing signed-in Mapo OS session in Chrome:

- `/home` → expanded shortcuts → **Cove** → OS authorization → existing `/academy/dlab-mapo`, shown as **Manager**. No credentials were requested on this shortcut path.
- Manager's **My classes** listed all 17 active classes. An existing class live roster and solution-status page opened successfully. Course directory showed 29 courses.
- Opened an existing test course and coding activity. Staff-practice, View solution, Tutoring and Edit controls were visible; the exercise editor loaded with Save changes disabled. No fields were changed.
- A fresh direct `/sso/start` attempt showed OS's remembered-account chooser. Continuing with the existing Mapo account returned to the same academy without a password. A subsequent browser refresh retained the session. The chooser remains provider-owned behavior; this does not claim every entry path skips account selection.
- Opening Daechi's academy URL with this Mapo session showed **Page not found / cannot be accessed**. No cross-campus content was displayed.
- An existing graded submission result was read through a restricted read-only diagnostic (status FAILED, 90/100, 9 of 10 cases). No new grading run was performed. Judge, course GUI and the existing separate public Turtle broker remained healthy. No fresh Turtle drawing or broker repin was performed: the release diff contains no Turtle/browser/GUI changes.

Private screenshots and identifier snapshots remain under ignored migration artifacts and are not committed. Local provider-double Chromium/WebKit tests for Manager, Team Lead, Teacher and Student are recorded in [implementation verification](2026-11-04-dlab-multicampus-sso-verification.md). The live check here used the available Mapo Manager session; it does **not** claim real HQ Teacher/Student or new-campus accounts were tested in production.

## Recovery and workspace isolation

Private pre-release API/manifest backups remain in the server's restricted release-state directory. Setting the automatic-provisioning flag false stops new academy creation without deleting existing mappings or learning data; use the audited campus-access command for a targeted revocation. Image rollback must retain the new academy/mapping rows.

Deployment work was performed in a separate release worktree. The user's monitoring/student-history checkout, branch and uncommitted changes were not switched, stashed or edited.
