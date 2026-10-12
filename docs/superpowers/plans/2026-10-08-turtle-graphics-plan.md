# Turtle behavior parity implementation plan

Approved scope: revised turtle design requested for implementation on 2026-10-08.
Branch: feat/lecture-pdf-materials. PDF and turtle implementation share this branch.

- [x] Build a separately deployed CPython/Tk virtual-display runtime with authenticated VNC/terminal sessions, bounded admission, isolation, lifecycle cleanup and runtime tests.
- [x] Add additive material/manual-submission/review schema and shared validation; enforce typed files, immutable attempts, permission/visibility and score policies.
- [x] Implement authoring, drafts, Run/Stop, Submit, review/rerun/feedback, copy/adoption and ordered mixed-content navigation.
- [x] Integrate student and teacher UIs with the actual remote GUI and existing Cove editor/styles; cover written responses and independent score exclusion.
- [x] Add development/production deployment configuration with runtime flag disabled by default and documented capacity/cleanup.
- [x] Apply migration only to the verified development database, run service/contract/API/UI checks and production builds.
- [x] Run localhost E2E with real API, web, GUI runtime and disposable fixtures: drawing, keyboard/input/event loop, stops/timeouts/recovery, manual review, visibility and mixed-material regressions.
- [x] Report measured results, deployment requirements and remaining Elice reference-verification gaps accurately.

Verification: eight browser scenarios passed across targeted runs (four turtle runs across Chromium/WebKit, one PDF regression and three ordinary Python regressions), 88 affected API tests plus one real HTTP parser integration test, seven Docker runtime/policy tests, and 124 translation tests. Shared/API/web builds and affected typechecks passed. Database client-access and immutable-history guards were verified against the development fixture. See [runtime operations and measured results](../../operations/turtle-runtime.md).

Next.js route/client guides were read from the installed node_modules documentation before implementation. No writing-plans skill is installed in the available skills directories; this repository plan records the authorized implementation directly. Do not modify production infrastructure or real Elice submissions/grades during local implementation/testing.
