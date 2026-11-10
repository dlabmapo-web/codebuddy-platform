# Complete the C/C++ execution branch

Reference: [approved phase-1 spec](../specs/2026-11-09-c-cpp-execution-design.md).

The branch already contains the core implementation. Preserve that work and unrelated working-tree files. Finish phase 1; interactive input remains phase 2. Do not deploy or admit production C/C++ work during completion.

1. Establish shared/runtime/API/web build and test baselines; fix remaining failures.
2. Complete runtime transport, compilation lifecycle and artifact accounting; add focused regression tests for cancellation, busy capacity and family readiness.
3. Finish language-aware API projections, permissions, server Run/Test admission and hidden-case protection. Count changed read paths against disposable PostgreSQL.
4. Finish student, staff, teacher, solution and history editor/run paths, diagnostics and translations. Preserve Python behavior.
5. Complete production/qualification mounts, deployment validation, rollback guard and operator documentation. Add deployment regression tests.
6. Build the native image, run available local checks and exercise representative C/C++ programs. Run the real Linux qualification only in a compatible isolated environment; record unsupported prerequisites honestly.
7. Run final typechecks, relevant tests, deployment validation and browser acceptance where available. Save a concise evidence report with remaining release-only gates.
