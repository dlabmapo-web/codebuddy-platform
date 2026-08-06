# Safari Interactive Python Compatibility

**Date:** 2026-08-06
**Status:** Approved for implementation

## Problem

The student exercise workspace only starts its interactive Pyodide runner when
the document is cross-origin isolated. The application currently sends
`Cross-Origin-Embedder-Policy: credentialless` with
`Cross-Origin-Opener-Policy: same-origin`. Chromium accepts that combination,
but Safari does not establish cross-origin isolation from the `credentialless`
policy. As a result, Safari reports that interactive input is unsupported and
the Run control remains indefinitely in its Preparing state.

The expected behavior is browser parity: supported Safari versions must load
the same worker-backed Python runtime as Chromium, execute code, pause for
Python `input()`, accept terminal input, and resume execution.

## Approach

Use the broadly interoperable cross-origin isolation policy:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Apply the policy consistently in both Next.js response headers and the
deployment-specific static `_headers` file. Continue serving the Pyodide
worker and all Pyodide assets from the application origin with
`Cross-Origin-Resource-Policy: same-origin`.

This approach is preferred over user-agent-dependent response headers because
it follows one standards-based security model in every browser. It is also
preferred over a non-interactive Safari fallback because the fallback cannot
provide the required `input()` behavior.

## External Resource Compatibility

`require-corp` blocks cross-origin resources requested in `no-cors` mode unless
the resource explicitly opts into embedding. The application loads its runtime,
scripts, styles, fonts, and brand assets from the same origin. API and realtime
traffic use CORS-aware fetch or WebSocket transports and do not depend on
credentialless subresource loading.

Problem-authoring uploads are the relevant exception: rich-text images use
public Supabase Storage URLs. Image requests must opt into CORS by carrying the
`crossorigin="anonymous"` attribute. The rich editor must emit that attribute
for newly authored image markup, and the read-only rich-text frame must apply
it when rendering existing stored markup. Existing database content will not
require migration.

Links and downloadable attachments are navigations rather than embedded
subresources and remain unchanged.

## Runtime Behavior

When the document is isolated, the existing `InteractiveRunner` creates its
SharedArrayBuffers, starts `/pyodide-worker.js`, and marks the Run controls ready
after Pyodide initialization. Python `input()` requests continue to travel from
the worker to the terminal and submitted lines continue to wake the worker via
Atomics.

The capability check remains in place. On an actually unsupported or
misconfigured browser, the application must not construct SharedArrayBuffer or
the interactive worker. It will retain the unsupported-browser message rather
than crashing. This fallback is diagnostic protection, not the intended Safari
path.

Worker initialization failures must settle readiness and display an actionable
terminal error. The UI must not silently remain in Preparing forever after a
fatal worker error.

## Verification

Automated coverage will include:

- a configuration-level assertion that all document routes use
  `Cross-Origin-Embedder-Policy: require-corp` and that worker assets retain
  their CORP and immutable-cache headers;
- component or unit coverage that authored and rendered rich-text images opt
  into anonymous CORS;
- a WebKit end-to-end exercise proving that the page is cross-origin isolated,
  the runtime reaches ready state, a program pauses for `input()`, terminal
  input resumes it, and the expected output is shown;
- regression checks in the existing Chromium project so the policy change does
  not break the current runner or monitoring workspace.

The implementation will also run the affected package's type checking, linting,
unit tests, and targeted WebKit/Chromium end-to-end tests. If the local WebKit
runtime cannot expose SharedArrayBuffer despite the production headers, the
test must report that environmental limitation explicitly rather than weakening
the production assertion.

## Scope

This change covers Safari compatibility for the shared student and teacher
Python workspaces, cross-origin isolation headers, compatible rich-text image
loading, and regression tests. It does not replace Pyodide, add a server-side
execution path, change submission judging, or alter monitoring permissions and
presence behavior.
