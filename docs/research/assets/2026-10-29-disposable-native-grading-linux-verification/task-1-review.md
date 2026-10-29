# Task 1 review

Reviewed base `38e05b54b1b1dbdd41c872c46639722babd93c23` through head `5d2c00d1e897728b9d803d6bfcc9bba6eef7096d` against the Task 1 brief, implementer report, and approved disposable Linux design.

## Verdicts

- **Spec Compliance: PASS for Task 1 local contracts.** No blocking departure from the authorized scope or required provisioning interfaces found.
- **Task quality: APPROVE with one minor observation.** No Critical or Important findings.
- **Ubuntu runtime correctness: UNVERIFIED.** This review does not establish actual package availability, AppArmor loading, controller delegation, rootless daemon startup, broker readiness, kernel isolation, or native execution. Those require the later disposable Ubuntu workflow. The report correctly makes this distinction.

## Strengths

- The exact ephemeral-host/root guard precedes preparation mutations; fixed paths, absent-account/config checks, a sanitized subprocess environment, and explicit Docker endpoints bound the work to the disposable host (`deploy/scripts/grading/ci/provision.py:50`, `:157`, `:265`). There are no production-file changes, deployment operations, privilege bypasses, or substitute runtime drivers in this diff.
- Account/group separation, checked subordinate ranges, the private daemon directory, and the control-only worker group preserve the intended authority boundary (`provision.py:88`, `:186`, `:296`, `:325`). Rootful guest execution is not introduced: the sole rootful carrier stays stopped and is checked by exact identity (`:425`, `:461`).
- Production installer rendering is compared byte-for-byte, production SO_PEERCRED attestation is reused, and observed cgroup limits/controllers are checked rather than inferred from configuration (`provision.py:329`, `:348`, `:472`). Inspection of the unchanged installer and host start hook confirmed that this path does not invoke full production `collect_host` against the absent application stack.
- Image config IDs, image platform/labels, package bytes, strict broker tree identity, and production runtime schemas feed the generated manifest. Warm funding remains two 128 MiB declared guests within the execution budget (`deploy/scripts/grading/ci/bundle.mjs:9`, `:21`; `provision.py:425`).
- Broker readiness uses the real framed health protocol plus a fresh actual warm-pool observation, with no startup bypass (`provision.py:246`, `:369`). Cleanup validates identities before stopping resources, uses exact container IDs, and checks process/start-time, namespace, and cgroup disappearance (`:506`).

## Critical

None.

## Important

None. No task-approval blocker identified.

## Minor

1. **A completed cleanup receipt checks reappeared paths but not reappeared accounts/groups.** `deploy/scripts/grading/ci/provision.py:512`–`:514` returns `alreadyAbsent:true` before reaching the account/group checks. If either fixed account or group is recreated after cleanup without recreating the checked home/config paths, this branch reports absence despite the resource having returned. Consider checking that the fixed account and group names are absent before accepting an existing cleaned receipt. This does not authorize deleting a recreated resource: refuse it. It is nonblocking for the fresh disposable-host lifecycle and does not broaden cleanup authority.

## Review evidence and limits

Read the complete supplied change package (retrieving the initially truncated middle separately), the brief, the full implementation report, and the approved design. Inspected only the named production integration surfaces needed to resolve concrete compatibility questions: installer rendering, daemon attestation, strict tree identity, cgroup-limit helpers, the host start hook, and broker protocol/socket declarations. The production interfaces inspected align with the new callers.

No existing test suite was rerun, no host provisioning was attempted, and no source, index, HEAD, or remote was mutated. The implementer reports 18 local contract tests, Python/Node syntax checks, diff checks, and Mac refusal evidence; these are reported evidence, not reviewer-executed tests or native runtime proof. The only review write is this scratch report.
