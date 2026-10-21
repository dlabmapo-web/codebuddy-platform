# Automatic DLAB student/staff SSO implementation

Approved design: [spec](../specs/2026-10-21-dlab-os-automatic-student-staff-sso-design.md).
Branch: `feat/dlab-os-staff-sso`. No production changes in this implementation run.

1. Add shared exact role/scope policy and new-domain constants; validate rollout modes.
2. Add additive persistence, restriction provenance, integration events and database guards.
3. Share transactional reconciliation across login, PUT updates and operator commands. Serialize integration writes through one advisory lock before acquiring any row locks; keep provider/network calls outside transactions.
4. Generalize managed eligibility, per-academy authorization and generation revocation. Preserve legacy non-managed behavior.
5. Update Studio redirect validation and role-aware activation/inactivity handling using installed Next documentation.
6. Add dry-run operator tools and update active deployment/testing documentation.
7. Run focused tests against an isolated local PostgreSQL/Redis fixture, browser E2E with controlled external-service doubles, typechecks/builds and deployment validation. Record real-provider coverage separately and never infer it from doubles.

The referenced writing-plans skill is not installed in the available local skill directories; this plan follows the repository's existing plan format. The user explicitly approved implementation and E2E testing after reviewing the spec.

## Initial completion

Steps 1–7 are implemented and locally verified. The clean isolated run passed all 67 migrations, 207 focused API/shared/Studio tests and 15 browser cases. API and Studio production builds, API/Studio/E2E typechecks, schema validation, 136 translation tests and deployment validation passed. See the [verification report](../../research/2026-10-21-dlab-student-staff-sso-verification.md) for evidence and remaining live-HQ release conditions. No production or hosted development changes were made.

## Approved October 21 role correction

The user approved the corrected spec mapping: `instructor`/`tutor` → Teacher, `lab_head` → Team Lead, `edu_manager` → Manager.

1. Update the shared role policy; retain exact OS codes, campus admission and non-admin fallback.
2. Update role/scope expectations and last-manager tests; add regression coverage for reconciling an existing tutor Student membership while preserving account, membership and history IDs and invalidating its session.
3. Add browser coverage for tutor Teacher access, swapped team-lead/manager dashboards and Manager-only permission checks. Run the isolated complete SSO suite and E2E typecheck.
4. Build compatible local API/Studio shared code, reconcile only the verified development target with the audited operator command, and verify the supplied real teacher account reaches Teaching overview. Record live results separately; production changes require their own release.

The role correction is complete: 208 focused tests and 16 browser cases passed, E2E typechecking passed, and the existing development tutor account was reconciled without new IDs. Real OS login and refresh show Teacher / Teaching overview. Production was unchanged.
