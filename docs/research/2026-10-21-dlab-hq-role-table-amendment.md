# DLAB SSO: latest HQ role table and domain handoff

Date: 2026-10-21. Branch: `feat/dlab-os-staff-sso`.

## Current role mapping

The platform owner requested implementation of the newly supplied HQ screenshot. Its aligned right-column rows are the current mapping; the smaller inline “OS 연결” notes show the previous mapping. Earlier reports describe historical behavior, not this amendment.

| Verified OS `user_role` | Cove role |
| --- | --- |
| `student` | Student (`STUDENT`) |
| `tutor` | Teacher (`TEACHER`) |
| `instructor` | Team Lead (`TEAM_LEAD`) |
| `so_staff` | Team Lead (`TEAM_LEAD`) |
| `edu_manager` | Team Lead (`TEAM_LEAD`) |
| `lab_head` | Manager (`MANAGER`) |
| `hq_admin` | Platform Admin (`User.platformRole=ADMIN`) |

This changes `instructor` from Teacher to Team Lead and `so_staff` from Student to Team Lead. The shared policy is used by both managed-account reconciliation and request authorization. Names, email addresses and the account labels in chat never determine permissions. Only exact verified OS role codes receive staff/admin privileges; unknown codes retain the existing primary-campus Student fallback.

Team Lead permissions include curriculum management, teacher assignment and class enrollment management. Manager includes those permissions plus the existing academy-management permissions. HQ Admin uses the platform console and its existing inspection/support rules; SSO does not create a Manager membership for it.

## Login and academy routing

1. HQ creates the OS account and assigns its real role and campus scope.
2. The user signs in at `https://os.dlabcampus.com/`.
3. The OS Cove card/shortcut opens **GET `https://cs.coveedu.com/sso/start`**. The same link serves students and staff.
4. Cove redirects to `https://os.dlabcampus.com/v1/sso/authorize`.
5. OS returns a one-use code and state to `https://cs.coveedu.com/sso/callback`.
6. Cove validates the transaction and exchanges the code server-side at `https://os.dlabcampus.com/v1/sso/token`, using the existing private client credentials with Basic authentication.
7. Cove creates or reuses the managed account, reconciles its role and approved campus memberships, and creates the Cove login session. No separate Cove signup or copying of OS passwords is needed.

Each external campus must be explicitly mapped once to the correct active Cove academy and enabled for SSO. Campus rollout mode then admits new eligible OS users automatically. Staff receive only campuses in their verified OS scope that are also enabled/mapped in Cove. No staff member is assigned to Daechi solely because the demo exists. Existing Mapo accounts require a deliberate identity-linking decision before connecting their campus.

Authentication does not automatically assign a teacher to a class or enroll a student into courses. These assignments must exist for the workshop's “student classes visible” check to succeed. Full `GET /courses` and `PUT /enrollments` synchronization remains outside the implemented SSO release.

## Deployment and testing status

The branch uses `DLAB_OS_BASE_URL=https://os.dlabcampus.com/v1` and restricts authorization redirects to that origin. Legacy Render authorization redirects are rejected by the new branch. The latest screenshot's domain requirement is already represented in the implementation and environment example.

A read-only check of production `/sso/start` on October 21 still returned an authorization redirect to **`https://dlab-os.onrender.com/v1/sso/authorize`**. Production has not been changed by this amendment. A matching API/Studio deployment and production environment update are needed before claiming the new domain is live. Deploy both sides together; a new Studio build will reject a backend still returning the old origin.

For the mapping amendment, follow [Applying a role-mapping change](../operations/dlab-sso.md#applying-a-role-mapping-change): temporarily disable new SSO entry, dry-run and apply the audited session invalidation/reconciliation command in the explicitly selected environment, then re-enable entry and require a fresh login. It preserves user/auth/membership IDs and history. No new schema migration is introduced by this role correction; the branch's existing staff-SSO migration is still a release prerequisite if not already applied.

The live OS accounts previously checked return `student`, `tutor` and `lab_head`. Those mappings are unchanged. Real acceptance for the newly elevated `instructor` and `so_staff`, plus `edu_manager` and `hq_admin`, still needs HQ fixtures. Automated provider doubles cannot prove the role code returned by a real HQ account.

### Verification of this amendment

- All 67 existing migrations applied successfully to a newly created disposable local PostgreSQL database; temporary Redis and PostgreSQL containers were removed after the run. Hosted development and production data were not changed.
- API build passed. The focused API suite passed **158 tests in 16 files**, including all seven known roles, unknown-code fallback, approved campus boundaries, HQ Admin admission/revocation, and unchanged ordinary-account authorization behavior.
- Added permission assertions prove that `instructor`, `so_staff`, `edu_manager` and `lab_head` can manage curriculum, teacher assignment and enrollment in an approved campus, while Student and Teacher cannot perform those management operations.
- Existing tutor Student → Teacher, instructor Teacher → Team Lead and so_staff Student → Team Lead reconciliation cases passed. They preserve user/auth/membership IDs and historical profile data, invalidate old sessions, and allow fresh role-correct logins without a student lease.
- Shared focused suite: **60 tests passed**. Studio SSO suite: **16 tests passed**. Combined focused result: **234 tests passed**.
- `pnpm typecheck:e2e` passed. Chromium scenarios were updated to include `so_staff` → Team Lead and the revised instructor mapping, but were **not rerun in this amendment**; the existing manual Studio server was left available. Earlier browser-pass counts in the historical report apply to their earlier mappings.
- The compiled shared package was checked directly and returned the new mapping and `https://os.dlabcampus.com/v1`. `git diff --check` passed.

Reproduction: the checked-in `pnpm test:dlab` creates disposable services and runs focused suites plus Chromium. This amendment used the same script through the focused Studio suite, omitting only its final browser command to avoid the running manual Studio server's shared Next dev lock. Test logs: `/tmp/cove-dlab-role-tests.log` and `/tmp/cove-dlab-role-e2e-types.log` (local, not committed).

### Subsequent release preparation

For the requested production release, the manual local servers were stopped and the complete `pnpm test:dlab` rerun passed: all 67 migrations, 234 focused tests and **21 Chromium browser cases**, including every OS role and all five legacy login roles. The servers were restarted afterward. Deployment validation and nine release/rollback-selection tests also passed. The general GitHub E2E workflow completed but skipped its browser suite because development database secrets are not configured; the 21 browser passes came from the local isolated suite.

The first CI run caught a hand-built academy root in the callback's membership check. It was replaced with the established `routes.academy()` helper, retaining the same identity/role/campus validation. CI must pass on this corrected commit before release tagging. The domain cutover is now part of the release manifest, preserving the private API file and restoring the legacy domain with the previous image on rollback.

## Information to coordinate with HQ

- Add the Cove card/shortcut for student and staff accounts at **GET `https://cs.coveedu.com/sso/start`**. The registered production callback is **`https://cs.coveedu.com/sso/callback`**. OS login alone does not navigate to Cove.
- Confirm the existing `client_id=cove` registration and callback are available on the new OS host. Keep the existing issued credentials private; request replacement only if HQ says they changed.
- Supply disposable `instructor`, `so_staff`, `edu_manager` and `hq_admin` test accounts privately, with each account's actual role code, external user ID, primary campus ID and authorized campus list. This is acceptance verification of the supplied mapping, not another request to redesign it.
- Confirm real campus IDs and which Cove academies they represent before enabling campuses beyond the isolated demo. For the October 26 workshop, agree the demo student/class/course assignments and test OS → Cove → visible classes on the actual production URL.
- The reference's HttpOnly session-cookie requirement remains a separate coordination point: Cove's SSO transaction cookie is HttpOnly, while its established Supabase browser-session design is unchanged. Do not claim full v1.2.1 compliance without HQ acceptance or a separately reviewed session redesign.

No OS database access is required. Verified SSO responses and authenticated integration updates provide the identity data.

## Copy/paste message: Korean

```text
Cove Studio 바로가기 주소는 https://cs.coveedu.com/sso/start 입니다. 학생·강사·직원 계정에서 GET 링크로 열 수 있도록 추가 부탁드립니다.
운영 콜백 주소: https://cs.coveedu.com/sso/callback

새 OS 주소(os.dlabcampus.com)에서도 기존 client_id=cove와 위 콜백 등록이 유지되는지 확인 부탁드립니다.

공유해 주신 표 기준 권한은 student→학생, tutor→선생님, instructor/so_staff/edu_manager→팀리드, lab_head→매니저, hq_admin→플랫폼 관리자입니다.
실제 연동 검증을 위해 instructor, so_staff, edu_manager, hq_admin 테스트 계정과 해당 계정의 캠퍼스 ID·접근 범위를 개인 DM으로 부탁드립니다.

워크숍 확인용 학생의 수업·코스 배정 정보도 함께 부탁드립니다. 운영 주소에서 OS 로그인 → Cove 진입 → 학생 수업 표시까지 확인하는 데 필요합니다.
```

## Copy/paste message: English

```text
Please add a Cove Studio shortcut for student and staff accounts using this GET link:
https://cs.coveedu.com/sso/start
Production callback: https://cs.coveedu.com/sso/callback

Please confirm that the existing client_id=cove and callback registration are available on os.dlabcampus.com.

The mapping follows your table: student→Student; tutor→Teacher; instructor/so_staff/edu_manager→Team Lead; lab_head→Manager; hq_admin→Platform Admin.
For live verification, please send instructor, so_staff, edu_manager and hq_admin test accounts privately, including their campus IDs and authorized campus scope.

Please also share the workshop student's class/course assignments so we can verify OS login → Cove entry → visible student classes on production.
```
