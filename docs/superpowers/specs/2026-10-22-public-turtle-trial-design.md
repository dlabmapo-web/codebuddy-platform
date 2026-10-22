# Public turtle trial classroom

Date: 2026-10-22 (Asia/Seoul)
Status: approved for implementation by the user on 2026-10-22; implemented on `feat/public-turtle-trial`. See [local verification](../../research/2026-10-22-public-turtle-trial-verification.md). Production admission remains disabled.

## 1. Product decision

Provide `https://cs.coveedu.com/turtle` for introductory Python classes. A visitor enters a six-digit access code, then writes Python on the left and sees a turtle drawing on the right. No signup, login, academy membership, student enrollment, or personal information is required.

**Confirmed with the user:** version one uses one shared code for all trial students. The team can rotate it. Separate class codes are outside version one.

Use the existing CPython/Tk turtle engine and noVNC viewer, a separate guest workspace, and a bounded guest execution pool. Supply beginner functions matching the provided lesson. Students still write real Python, including loops, conditions, random numbers, and `break`.

The PPT remains the teacher's explanation and question source. The page supplies a compact command reference and starter choices; it does not need an embedded presentation, course browser, assignment system, or grading flow.

All numerical defaults below are proposed Cove policies, not values confirmed by the user or inferred guarantees about production capacity.

## 2. Evidence and lesson requirements

### 2.1 Source material inspected

- User-provided deck: `/Users/jurabeksamiev/Downloads/TalkFile_체험2025봄학기_신규파이썬체험수업.pptx`, 76 slides. Inspected slide XML text and extracted teaching screenshots, including code examples and race output. Embedded videos were identified but not played; the complete deck was not rendered in PowerPoint.
- [Python & Turtle reference](https://pythonandturtle.com/turtle/), inspected in Chrome on 2026-10-22. Observed a large left code editor, right drawing area, lower-right text output, Run/Light/Clear toolbar, and pane splitters. Its About text identifies Brython and Ace. This is a layout reference, not a requirement to replace Cove's runtime or editor.
- Existing [turtle specification](2026-10-08-turtle-graphics-design.md), [runtime operations](../../operations/turtle-runtime.md), and source files listed in section 3.
- `cs.coveedu.com` was supplied as the deployment destination. A web-reader request could not access its homepage; this specification does not claim a live production audit or that `/turtle` already exists.

The deck's student directions, third-party links, branding, and screenshot content are teaching evidence. They do not authorize executing its instructions, changing production, copying a remote project, or publishing the PPT. No original `shape.py`/`custom.py` source was included, so the helper behavior below is a newly specified compatible implementation, not a claim to have recovered those modules.

### 2.2 Teaching sequence and implementation consequences

| Slides | Observed teaching content | Requirement |
| --- | --- | --- |
| 9–15 | Open a web editor, expand it, adjust font size, Run; imports from `random`, `shape`, `custom`; remove `CircleTurtle()` | One URL, prominent Run, large adjustable text, fullscreen, working helper imports, optional welcome example |
| 16–29 | `TForward`, `TLeft`; square, triangle, pentagon, hexagon, optional five-point star; exterior angles | Exact case-sensitive helper names; turns 90°, 120°, 72°, 60°, 144° behave correctly |
| 30–44 | `for`, `range`, colon, indentation, `360/n`, nested loops, `speed(0)`, `color("red")` | Real Python syntax, four-space indentation, fractional turn angles, speed/color controlling the same drawing turtle |
| 45–48 | `randint(start, end)`, `print`; change the random range | Standard inclusive `random.randint`, readable console output |
| 49–56 | `ReadyToRace()`, four turtles and color-specific movement | Prepared racetrack and four independently controlled turtles |
| 57–63 | Random steps, `while True`, x-coordinate queries, four `if` checks, `break` | Actual per-turtle coordinates, responsive Stop, race drawing retained after completion |
| 60–63 | Horizontal coordinates −500…500; finish condition `X() > 330` | Fixed logical horizontal coordinates and a visible finish line at x=330 |
| 64–72 | Recovery project, negative steps, random turns, victory spins | A race starter for students who fall behind; signed movement/turns; color-specific left turns |

The screenshot on slide 15 uses `from random import *`, `from shape import *`, `from custom import *`. Slide 38 uses `TLeft(360/n)`, so an integer-only angle validator would break the lesson. Slide 55 has a prose spelling inconsistency; executable examples establish `TForward`, not `Tforward`, as the supported name.

## 3. Current platform and reusable boundaries

| Existing location | Finding and design consequence |
| --- | --- |
| `packages/web/src/components/manual/manual-workspace.tsx` | Combines course instructions, files, drafts, assessment, and GUI controls. Reuse suitable presentation pieces; do not render this entire account-bound workspace for guests. |
| `packages/web/src/components/manual/gui-viewer.tsx` | Existing scaled noVNC drawing, reconnect, last-frame capture, fullscreen, keyboard release. Reuse with a small runtime-session interface rather than requiring course state. |
| `packages/web/src/app/(studio)/academy/[academySlug]/learn/exercises/[materialId]/_components/code-editor.tsx` | Existing Monaco editor accepts code and font size. Extract its reusable editor surface to a neutral component path if needed; do not import a studio route as the permanent public-feature dependency. |
| `packages/api/src/manual/manual.controller.ts` | Identifies a Supabase user and enforces active student sessions. Keep these requirements intact. |
| `packages/api/src/manual/manual.service.ts` | Runs resolve academy/material permission, private assets, runtime profile, and user ownership. Guest execution needs a separate service and principal. |
| `packages/api/src/manual/gui-client.service.ts` | Private broker transport can be extracted behind explicit pool configuration. Currently maps broker errors to 503; guest transport must preserve busy/conflict distinctions. |
| `packages/shared/src/content/manual.ts` | Existing source limits and runtime response are useful references; guest schemas must exclude assessment and course fields. |
| `packages/gui-runtime/src/server.mjs`, `policy.mjs` | Already provide isolated containers, owner uniqueness, bounded queue, lease, deadline, output cap, and capability-protected display. Reuse the engine. |
| `packages/gui-runtime/docker/run.py` | Runs an entry file through `runpy`; currently does not append a turtle event loop automatically. Guest helpers require an explicit runner contract. |
| `packages/web/src/proxy.ts` | `/turtle` is not in the Supabase-refresh matcher. Keep the page independent of the auth route groups. Proxy is not the guest authorization boundary. |
| `packages/web/src/lib/routes.ts` | Add the canonical turtle destination here instead of constructing page links throughout the app. |
| `deploy/caddy/Caddyfile` | Existing `/gui/sessions/<uuid>/display` routing exposes only display upgrades. Add a separate guest display namespace with equivalent restrictions. |
| API Redis configuration and `ioredis` dependency | Redis is already available. Use it for shared, expiring guest grants, ownership, admission locks, and rate limits. The existing process-local academy limiter is insufficient for public abuse controls. |

Before implementation, re-read applicable `AGENTS.md` files and the installed Next.js guides. For this spec, the installed route-group, route-handler, cookies, and Proxy guides were inspected: route groups do not alter URLs; `cookies()` is asynchronous; cookie mutation belongs in a handler/action; Proxy is not full session authorization.

## 4. Approaches considered

1. **Existing engine with guest-specific access and a separate execution pool — recommended.** Keeps real CPython/Tk behavior and existing viewer/isolation work. Requires provisioning and measuring guest capacity. A second broker must use a separate Docker daemon/host because the current broker removes all `cove.gui=true` containers at startup.
2. **Browser-only turtle interpreter.** Avoids per-student server containers and could fit larger classes economically. Cove's ordinary Pyodide worker does not provide its current desktop turtle behavior; a shim or another interpreter would require an independent compatibility project. Consider later if measured classroom capacity makes server execution unsuitable.
3. **Make existing manual/course endpoints accept unauthenticated users.** Smaller apparent change, but mixes guest access with academy materials, private assets, drafts, and submissions. Reject this approach.

Version one shares engine code and image builds with course turtle, while guest allocation and authorization remain separate. Do not point two broker processes at the current production Docker daemon.

## 5. Entry and workspace experience

### 5.1 Access screen

- Directly opening `/turtle` shows the code form without redirecting to `/login`, even if Supabase is unavailable. Signed-in visitors use the same guest gate.
- Korean-first copy with existing Korean/English locale support: title `파이썬 거북이 체험`, instruction `선생님이 알려준 6자리 코드를 입력해 주세요.`, action `시작하기`.
- One accessible text/password input, optionally styled as six cells, with a single label, numeric input mode, paste support, and Enter submission. Keep leading zeros. Require exactly six ASCII digits after trimming outer whitespace; never parse the code as a number.
- Wrong code: `코드가 맞지 않아요. 다시 확인해 주세요.` Rate limiting shows a retry countdown. Configuration/runtime outages show a temporary-unavailable state rather than reporting a wrong code.
- Do not allocate a container on page visit, PIN success, editor loading, or starter selection. Allocation begins only on Run.
- Refresh within a valid guest grant restores the workspace. Opening on another browser/device requires the PIN again.

### 5.2 Workspace

```text
Cove Turtle                                                [⋯]
[Run] [Light / Dark] [Clear] [Stop while a run is active]
┌──────────────────────────────┬──────────────────────────────────┐
│                              │                                  │
│ Editable Python              │ White drawing / prepared race    │
│                              │ Animated turtle cursor           │
│                              ├──────────────────────────────────┤
│                              │ Text output / error / input      │
└──────────────────────────────┴──────────────────────────────────┘
```

- At widths ≥1024px, editor and result start at 50/50 and resize from 30/70 to 70/30. The right pane has a vertically resizable console, initially about 30% of its height and expandable for `print` lessons.
- At 768–1023px retain the split when usable; below 768px use Code/Drawing/Output tabs, with Run/Stop always reachable. Do not shrink the entire race to an unreadable strip.
- Font defaults to 18px, adjustable 14–28px. Editor has Python highlighting, line numbers, four-space indentation, normal copy/paste, and no mandatory file-tree interaction.
- Run executes the current saved-in-memory code snapshot; changes during execution apply to the next run. Run remains available after startup. Pressing it stops the previous owned run before starting a fresh drawing with the current code. A separate Stop control is present while a run is active. Controls are disabled during an in-flight start/stop request.
- A finished drawing remains visible. The canvas is white with no desktop border, keyboard toolbar, live badge, or visible connection labels. Resizing scales the viewport without changing turtle coordinates. Workspace fullscreen is available in More options.
- Examples, font size, reset code, command help, downloads, fullscreen, Exit, and the tab-save indicator live in the More options menu. The normal workspace shows only the compact brand bar and Run/Light/Clear toolbar.
- `코드 초기화` replaces only the current starter's editable code after confirmation. `지우기` (Clear) stops/removes the current run and clears its drawing/output, retaining code. A new Run always starts from fresh Python/turtle state.
- `나가기` revokes the guest grant, stops its active/queued run, clears trial drafts and transient viewer data, and returns to the PIN form. It does not sign the visitor out of Cove Studio.
- The help drawer lists lesson commands, arguments, one-line Korean explanations, and examples. Opening help never replaces code. Include a short bridge from `TForward(100)` to standard `turtle.forward(100)`.
- Errors show a concise Korean explanation and the editable `main.py` line when known, with expandable original Python details. Missing colon, indentation, wrong helper case, and missing race setup receive targeted deterministic hints. Do not send student code to an AI service.

### 5.3 Starter choices and local work

Provide three explicit choices, not an entire mission/course system:

| Starter | Editable initial code | Purpose |
| --- | --- | --- |
| 도형 그리기 | Teaching imports, red pen, `speed(1)`, and a four-sided square loop | Teacher-led movement, polygons, loops, color, and random values |
| 거북이 경주 | Same imports, `ReadyToRace()`, and a comment inviting movement code | Race setup without giving away its loop or finish checks |
| 자유 연습 | Same imports and an empty coding area | Experiments or teacher-provided code |

Import preamble is visible in `main.py`, matching the PPT. Students may edit the entire file; provide a `기본 코드 복원` action if imports are deleted. Helpers themselves are bundled read-only resources, not extra editable tabs students must manage.

Store each starter's code and editor preferences in this tab's `sessionStorage`, debounced at about 500ms, under a versioned turtle-only key. Preserve it across refresh and grant expiry in that tab; switching starters retains each buffer. Do not store the PIN, grant token, display capability, or terminal transcript there. Closing the tab or Exit ends this local retention. Show `이 탭에 임시 저장됨` inside More options; storage failure leaves editing usable with an unsaved indication in that menu.

Provide `main.py` download for deliberate export, plus a project ZIP option containing the helper bundle/version and a short README so code using `custom`/`shape` is reproducible outside Cove with Python/Tk. Never include platform secrets or another visitor's content.

## 6. Beginner helper API

### 6.1 Import and runtime contract

Support the exact teaching preamble:

```python
from random import *
from shape import *
from custom import *

# 여기에 코드를 작성해 보세요.
```

Implement Cove-owned `custom.py` and `shape.py`, versioned as `cove-trial-v1`. `custom` exports the lesson helpers plus standard `speed` and `color`. `shape` exports `CircleTurtle`; neither wildcard import exports implementation internals. Importing modules must not start the race, draw a welcome animation, or redefine `randint`/`print`.

`TForward`, `TLeft`, `speed`, and `color` all operate on the same default turtle. New helper drawing turtles use a 5-pixel pen and speed 1; the guest screen defaults to a 30 ms animation delay so movement is visible. Explicit speed and standard turtle pen settings remain adjustable. Race turtles also use a 5-pixel pen and speed 1 after their instant setup. Helpers are thin adapters around standard turtle behavior; they do not invent a Python-like language or hide loops/conditions behind a complete `Race()` function.

The guest API assembles fixed helper files and a fixed entry runner with submitted `main.py`. The runner prepares a full-size borderless white screen and the helpers select a turtle-shaped cursor for movement. It executes `main.py` at its actual filename, flushes the screen, and enters `turtle.mainloop()` after normal completion when a screen remains open. An explicit student `done()`/`mainloop()` continues to work. Exceptions remain errors and do not become successful completed programs. On an error, retain the latest delivered drawing as best effort alongside the traceback.

Finite drawings therefore remain in the running/display phase until Stop or the run deadline; keep the canvas visible when the runner signals source completion; omit a persistent status label for this normal ready state. Capture the displayed frame before deliberate Stop so it remains visible after resources are released. Do not claim that the current broker captures a server-side final screenshot; it does not.

### 6.2 Function contract

| API | Required behavior |
| --- | --- |
| `TForward(distance)` | Move the default turtle by a finite numeric distance; negative values move backward; draw a trail. |
| `TLeft(angle)` | Turn the default turtle counterclockwise by a finite number of degrees, including fractions and negatives. |
| `speed(value)` | Standard turtle speed: 0 is fastest; integer 1–10 controls animation. |
| `color(value)` | Standard named/hex color controlling that same turtle and its pen. |
| `CircleTurtle()` | Optional small welcome/demo drawing with original Cove artwork/code; repeated calls reset only its own demo. It is not inserted into the default starter. |
| `ReadyToRace()` | Clear previous scene and race state, prepare track, create four named turtles at their start positions, and return without starting a race loop. Repeated calls produce exactly four racers. |
| `BlueForward(d)`, `PinkForward(d)`, `YellowForward(d)`, `GreenForward(d)` | Move only that racer along its current heading, with a colored trail; accept negative distances. |
| `BlueLeft(a)`, `PinkLeft(a)`, `YellowLeft(a)`, `GreenLeft(a)` | Turn only that racer counterclockwise; signed/fractional angles work. |
| `BlueX()`, `PinkX()`, `YellowX()`, `GreenX()` | Return the racer's actual logical numeric x coordinate, not pixel positions or a move counter. |

Numeric helpers reject booleans, non-numbers, NaN, and infinity with a helpful argument error. They accept ordinary finite `int`/`float` values. Calling a race-specific function before `ReadyToRace()` raises an actionable message naming that setup function. Helper frames can be collapsed in error UI; preserve the student's caller line.

Race coordinates are independent of pane size: visible horizontal world is −500…500, start x=−400, finish x=330. Suggested lanes are y=180, 60, −60, −180. Use identical x/y scale based on the actual Tk canvas dimensions and scale the resulting viewer with letterboxing. Keep the complete track visible at the fixed runtime display size. The four racer identities and Korean labels remain Blue/파랑, Pink/분홍, Yellow/노랑, Green/초록; color alone must not identify a racer.

Retain the PPT's strict `X() > 330` comparison in examples. Helpers must not silently stop at the finish, select a winner, clamp negative movement, or disable turns. Discovering the finish condition is part of the lesson. If several turtles pass in one loop, the order of the student's checks determines the declared winner.

### 6.3 Compatibility examples

This square must work without a student-written event loop:

```python
from random import *
from shape import *
from custom import *

color("red")
for i in range(4):
    TForward(100)
    TLeft(90)
```

The teacher/reference fixture below exercises the race contract. Do not put the completed solution into a student's initial race buffer:

```python
ReadyToRace()
while True:
    BlueForward(randint(1, 20))
    PinkForward(randint(1, 20))
    YellowForward(randint(1, 20))
    GreenForward(randint(1, 20))
    if BlueX() > 330:
        break
    if PinkX() > 330:
        break
    if YellowX() > 330:
        break
    if GreenX() > 330:
        break
```

## 7. PIN, guest grants, and abuse controls

A six-digit shared code has only 1,000,000 possibilities. Treat it as classroom admission, not a strong identity credential or permission to access academy data. Use server verification, a separate high-entropy guest grant, bounded execution, and the existing sandbox. The code is not MFA or a one-time password.

- Configure `TURTLE_TRIAL_PIN_DIGEST`, `TURTLE_TRIAL_PIN_PEPPER`, and `TURTLE_TRIAL_PIN_VERSION` only on the API. Digest is HMAC-SHA256 of the exact six-digit string with a randomly generated ≥32-byte pepper. Compare validated fixed-length digest bytes in constant time. An operator-only local utility generates a random code and digest without putting the code in shell arguments, git, build output, or logs. Distribute the actual code to teachers outside the app.
- Never expose the code/digest/pepper through `NEXT_PUBLIC_*`, HTML, JS, bootstrap responses, analytics, URLs, or source examples. Missing/invalid production settings disable the trial; there is no default code.
- On success issue an opaque random 32-byte token. Store only its SHA-256 lookup key in Redis, with grant ID, PIN version, issue time, expiry, and active run reference. No Supabase anonymous user or database student record is created.
- Set a host-only `__Host-cove-turtle` cookie with Secure, HttpOnly, SameSite=Lax, Path=/, Max-Age=7200. Its scope is guest turtle even though cookie path is root; other application routes do not treat it as a login. Use a distinct insecure-development cookie only on localhost.
- Grant expires absolutely after two hours; refresh/polling does not extend it. Re-entering the correct code can issue a new grant, preserving the current tab's code but ending the old grant's run.
- For mutating browser requests require exact configured Origin, same-origin fetch metadata when present, and an application-only CSRF header. No wildcard credentialed CORS. Reject mutations with missing/unexpected Origin outside the explicitly configured local/test flow.
- Make limiter updates atomic in Redis across instances. Initial limits: ten access attempts per pre-access browser nonce per ten minutes; 120 attempts per trusted client IP per ten minutes; 600 attempts per deployment per minute. The IP limit is deliberately higher than one child's retries so a class behind one NAT can enter. Use Retry-After; never lock the shared PIN globally because somebody guessed incorrectly. Alert on sustained deployment-level rejection.
- Use a short-lived signed HttpOnly pre-access nonce cookie for the browser limiter, not a user-selected request field. Clearing cookies does not bypass IP/deployment limits. Count malformed and failed attempts; edge limits apply before expensive work.
- Derive IP only from the known reverse proxy chain, which must overwrite incoming forwarding headers; never trust arbitrary `X-Forwarded-For`. Retain IP limiter keys as keyed hashes with bounded TTL, not permanent visitor profiles.
- Initial execution limits: one active or queued run per grant, twelve accepted starts per grant per minute, sixty per hour, and at most 1,800 seconds of admitted container time over the two-hour grant. Reserve each run's maximum duration atomically before admission and refund unused seconds on terminal cleanup; reconcile lost callbacks without allowing overspend. Do not impose a low per-IP run cap that blocks an entire class.
- Redis failure fails closed for code verification, grant validation, and Run. Existing runs lose authorization renewal and are cleaned up by the lease; editor buffers remain usable/exportable.
- PIN rotation changes digest and version together. Store the authoritative active version in Redis; API replicas whose configured digest/version does not match it reject access issuance until updated. All old grants become invalid on the next server check, including during rolling releases. Their display sessions lose lease renewal and must be stopped within 30 seconds of the last valid renewal. Exit revokes its grant and requests immediate Stop. Never allow an open WebSocket alone to renew a grant or lease.

Use the [OWASP session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) for unpredictable grants/cookie handling and [authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) for throttling and safe verification. The specific limits above are Cove defaults and require classroom validation.

Turnstile is a later escalation option if observed abuse warrants it, not a new mandatory step in version one. If added, use the existing component/service, verify tokens on the server, require production configuration, and test its iframe with the application's COEP headers. The existing development fail-open behavior must not become a production trial bypass. [Cloudflare validation documentation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)

## 8. Application and API design

### 8.1 Public web surface and API boundary

Add `packages/web/src/app/(public)/turtle/page.tsx` and feature-local components. Keep the common root theme/i18n providers, but inherit neither studio auth layouts nor signed-out-only login guards. Add `routes.turtle` to the canonical route module. No new public marketing navigation is required for the direct-link release.

Use same-origin Next Route Handlers under `/turtle/api/*` as a small backend-for-frontend. They read the HttpOnly guest cookie, forward only the required guest token to the private API, and return safe response shapes. Overwrite rather than forward caller-supplied internal guest headers. The Nest API independently validates the guest grant; a Next page check alone never authorizes a run.

| Browser endpoint | Behavior |
| --- | --- |
| `GET /turtle/api/challenge` | Issue the short-lived pre-access nonce cookie before form submission; rate-limit issuance by trusted IP and deployment. This is not a CAPTCHA or guest grant. |
| `POST /turtle/api/access` | Validate `{ pin }`, nonce, origin and limits; issue cookie after API verification; return expiry and allowed starter IDs. |
| `GET /turtle/api/bootstrap` | Validate grant/version; return helper version, starter code, safe execution limits, and this grant's existing run when present. Without a grant or with an expired grant, return HTTP 204 and show the PIN gate without a console authorization error. Protected execution endpoints still reject missing grants. |
| `DELETE /turtle/api/access` | Revoke grant, cancel active/queued run, clear cookie; safe to repeat. |
| `POST /turtle/api/runs` | Accept only `{ source, starterId, helperVersion, requestKey }`; validate and create or recover an idempotent run. |
| `GET /turtle/api/runs/:id` | Validate grant and run ownership; return state, bounded output, expiry, and display capability for its owner; renew the execution lease. |
| `DELETE /turtle/api/runs/:id` | Cancel owned queued/start/run session and release resources; safe to repeat. |
| `POST /turtle/api/runs/:id/input` | Send at most 4,096 UTF-8 bytes to that owned run's stdin in an input-capable state. |

Corresponding Nest routes live under `/api/turtle-trial`, in a new module independent of course authorization. Guest grants never authorize `/api/manual`, course content, storage downloads, monitoring, submissions, or admin operations. Guest requests cannot select `academyId`, `materialId`, asset IDs, private solutions, runtime image, entry point, helper content, profile limits, or owner identity.

Reject unknown fields. Limit `source` to 64 KiB UTF-8; cap JSON bodies at 96 KiB at both public and API boundaries. Do not attach the 30 MB manual body parser to this route. The API creates the trusted file manifest with exact names and rejects a stale/unknown helper version with a recoverable reload response. There are no arbitrary source uploads or package installs in this page.

Use an atomic per-grant admission lock and a random UUID request key to handle concurrent tabs, retries, and a lost Run response. A retry of the same key returns the original owned session; a new key while active returns conflict. Save ownership/idempotency in Redis before replying and clean up a broker run if saving the binding fails. Broker owner uniqueness supplies a second guard. Add a private, service-authenticated lookup by guest owner/request key and idempotent create behavior to the broker protocol; the existing broker does not expose this recovery operation. Transport recovery must reconcile an uncertain create result through that lookup before creating another run. Never expose owner lookup publicly or permit it to return a different grant's session.

### 8.2 Session responses and errors

- Use a narrow guest session DTO compatible with the viewer, not a fake `ManualWork`/academy target. Keep display capabilities in memory, never local storage or query strings, and redact WebSocket subprotocols from logs.
- Poll an active/queued session once per second without overlapping requests; stop polling terminal states. Resume from bootstrap after refresh. If a browser suppresses background polling beyond the 30-second lease, the run is allowed to end; show a Run-again message when the tab resumes.
- Return 401 for missing/expired/revoked grant; 404 for another grant's run; 409 for active-run/helper-version conflict; 413 for oversize source; 429 plus Retry-After for rate/capacity limits; 503 for unavailable dependencies. Preserve broker busy errors instead of flattening them all to 503.
- Handle network loss, queue expiry, startup failure, error, timeout, output limit, disconnect, and Stop as separate UI states. Never erase code on an error or automatically start a second billed/container execution on retry.
- PIN, grant, bootstrap, source, status, and output responses use `Cache-Control: private, no-store`. Add noindex/nofollow and `Referrer-Policy: no-referrer` to trial pages. Retain the platform's security headers; do not weaken global COEP to introduce the page.

## 9. Execution isolation and capacity

Create a guest broker deployment from the same maintained GUI service code and approved runtime image. Give it its own service secret, private control URL, Docker daemon/host, and capacity setting. The API's guest runtime client must not fall back to the course broker when configuration is missing.

Expose only `wss://cs.coveedu.com/turtle-display/sessions/<uuid>/display` through Caddy, stripping the prefix for the guest broker. Keep broker REST, `/health`, VNC, and Docker inaccessible publicly. Require the exact web Origin and the existing per-session display capability. `/turtle-display` cannot route to the authenticated course broker, and `/gui` cannot route to the guest broker.

Retain the engine's unprivileged user, no network, read-only root, dropped capabilities, seccomp profile, CPU/PID/memory bounds, bounded tmpfs, no host/application secrets, and explicit sandbox checks. Helper Python is teaching code, not a sandbox boundary; students can write arbitrary Python inside the isolated container. Do not run it in the web/API process.

Proposed fixed guest profile: 1024×640 display, one CPU, 512 MiB memory, 64 PIDs, 120-second maximum wall time, and 256 KiB combined terminal output. The two-minute timer includes interactive input, slow drawings, source-complete display holding, and infinite loops. Show a countdown near expiry and retain code for rerun. Guest profile overrides must be server-selected and allowlisted; ordinary course defaults remain unchanged.

The current broker output cap is 1 MiB and wall limit comes from its manifest. Add an optional trusted output-limit policy whose default remains 1 MiB for course callers, constrained to an approved range; the guest client supplies 256 KiB. Preserve the existing 30-second owner lease/reconnect grace, queue expiry of 60 seconds, and queue bound of four times capacity. Queued jobs allocate no container and grant expiry cancels them before execution.

Start development with one guest slot. **A one-slot deployment is not acceptable for a classroom launch.** Use an initial planning assumption of 20 simultaneously running students, then size and configure production guest capacity for the actual class. At 512 MiB per admitted run, 20 slots reserve at least 10 GiB for container memory alone; broker/host/CPU headroom is additional. Current low-capacity shared-VPS documentation does not establish those resources. Provision a separate execution host/daemon and pass the class-sized concurrency rehearsal before opening the trial to a class.

The final capacity is measured and configured, not raised automatically. The page must show a bounded busy/queue state under excess load; guest usage must not consume authenticated-course slots. If provisioning for the measured class is unsuitable, revisit approach two before implementation expands into a public launch.

## 10. Persistence, operations, and rollout

- No guest enrollment, assignment, score, point award, solve record, teacher monitoring record, or permanent source draft is created. Redis holds short-lived grants, ownership, locks, idempotency and quota accounting; container files/output are ephemeral. Expire bookkeeping no later than grant expiry plus ten minutes. Retain only aggregate operational metrics without student code/PIN/tokens or full IP addresses.
- Add independent API/web trial feature flags, both disabled by default. The API flag rejects new grants/runs; the web flag can show an unavailable screen. The web release flag must reach the image build if compiled into public configuration.
- Add trial variables to typed environment validation, examples, CI/deployment manifest, private secrets configuration, and operator docs. Required values include feature flags, PIN digest/pepper/version, guest control URL/secret, public display URL, Redis URL, and guest capacity. Validate positive capacities and distinct pool destinations; reject missing configuration at enabled startup.
- Document rotation, revocation, emergency disable, cleanup, and capacity changes. Emergency disable prevents renewal and stops guest sessions within the lease bound; course execution continues through its own pool. Preserve source downloads and local editing long enough for students to recover work when possible.
- Release through local verification, staging with disposable PIN and real guest containers, then production smoke verification with a fresh browser and operator-provided production code. Run no destructive tests against real students or production course data.
- Do not publish the attached PPT or follow its shortened links as part of this feature. If the team later wants in-page lesson images, treat that as a separate content preparation task.

## 11. Implementation units

| Unit | Owns | Dependencies / boundaries |
| --- | --- | --- |
| Public turtle page and access form | PIN entry and guest-only page state | Same-origin trial client; no Supabase session requirement |
| Trial workspace | Editable buffer, starters, split panes, local recovery, downloads | Existing editor/viewer and guest session DTO |
| Next trial handlers | Cookie handling, browser origin checks, safe forwarding | Async Next cookies API and private API origin |
| Trial API module | Grant verification, rate/quota policy, idempotency, run ownership | Dedicated Redis namespace and guest runtime client |
| Runtime transport | Broker protocol and typed failures | Explicit course or guest configuration; no automatic fallback |
| Helper bundle and guest runner | Teaching API, race scene, source completion/display lifecycle | Standard Python turtle; immutable helper version |
| Guest runtime deployment | Bounded containers and capability display gateway | Separate daemon/host, approved image and private secret |

Suggested new locations: `packages/web/src/app/(public)/turtle/`, `packages/web/src/lib/turtle-trial/`, `packages/api/src/turtle-trial/`, `packages/shared/src/turtle-trial/`, and a versioned helper bundle under `packages/gui-runtime/`. Place guest Next handlers under the same route group. Keep any editor extraction limited to what the public workspace needs; avoid unrelated manual-workspace rewrites.

## 12. Acceptance and verification

### Student and lesson behavior

1. A fresh browser reaches `/turtle`, enters a valid shared six-digit code including a leading-zero fixture, and opens the editor without creating or reading a Supabase account.
2. The first Run with `TForward(100)` visibly moves a turtle. Square, triangle, pentagon, hexagon, star, and fractional-angle polygon fixtures match the PPT concepts; `speed` and `color` affect the same turtle.
3. `print(randint(1, 20))` appears in Output; seeded tests prove inclusive bounds without asserting a particular unseeded random result. Standard console `input()` works.
4. Race setup produces exactly four turtles; each Forward/Left/X function targets the right turtle. Negative movement and random turns work; `X() > 330` breaks the supplied fixture, and 36 turns of 10 degrees produce a full celebration spin.
5. A tight infinite loop cannot freeze the browser or prevent Stop; timeout and output spam release their container. A simple finite drawing stays visible despite the student omitting `done()`.
6. Pane resizing/fullscreen does not alter world coordinates or clip the race. At 390px viewport width, Code/Drawing/Output remain usable; keyboard focus can leave the viewer with Escape.
7. Refresh recovers this tab's code and owned run. Switching starters preserves buffers. Clear drawing preserves code; reset is confirmed; Exit removes guest state without changing a Cove login.
8. Downloaded helper-based projects run on a supported local Python/Tk installation using the included instructions.

### Security and lifecycle

9. Direct guest API access, forged/expired grants, wrong PINs, changed PIN version, stale helpers, excessive source, extra fields, and untrusted origins are rejected. No secret appears in browser bundles, HTML, URL, storage, logs, or error payloads.
10. Guest A cannot fetch, attach to, input into, cancel, or renew guest B's run, including with a guessed/copied run ID. A guest grant cannot access manual/course/student endpoints or private assets. Course and guest display namespaces remain separate.
11. Two simultaneous Run requests and a lost create response produce at most one active/queued container for a grant. Same-key retry recovers it; another tab receives a useful conflict. Accounting and locks remain correct across API instances/restarts.
12. Closing a tab, grant expiry, rotation, emergency disable, Redis outage, API restart, broker restart, and failed binding cleanup leave no unbounded/orphaned executions. Revoked display sockets stop within the lease bound. Existing authenticated turtle remains functional.
13. Multiple API instances enforce the same counters. A simulated class sharing one NAT can enter and run; cookie clearing and forged forwarding headers do not bypass deployment limits. Expired limiter/bookkeeping keys are removed.
14. A real isolated-container check proves no outbound network, host mounts, Docker socket, database credentials, service secrets, or access to another run. Check CPU, memory, PID, filesystem, output and wall-time termination.
15. Staging runs the actual expected class size concurrently, including race animation, source-complete display holding, reconnect, and Stop. Record peak memory/CPU, queueing, startup delay, and cleanup; configured admitted slots must fit measured resource headroom.

Use focused helper tests, API authorization/concurrency tests with real Redis, runtime integration tests with real Docker, and Chromium/WebKit browser scenarios using a disposable PIN. Include existing course turtle, ordinary Python, and canonical route regressions. No production rollout is complete solely because a one-student smoke test passes.

## 13. Explicit version-one exclusions and review points

Excluded: per-class code management, public code sharing, server-saved student projects, lesson authoring, PPT hosting, grading/submission, teacher live monitoring, AI assistance, file uploads, arbitrary package installation, and redesigning the existing academy turtle product.

Before implementation, review the proposed workspace and helper contract, the two-minute per-run limit, and the separate execution-pool requirement. The shared-code decision is already confirmed. Before deployment, record actual classroom size and measured/provisioned capacity; these are operational release requirements, not reasons to introduce student accounts.

Standard turtle movement, turn, color and event-loop semantics follow the [Python turtle documentation](https://docs.python.org/3.12/library/turtle.html). The layout remains an original Cove implementation informed by the [reference editor](https://pythonandturtle.com/turtle/), with lesson compatibility grounded in the inspected PPT slides rather than the reference site's interpreter choice.
