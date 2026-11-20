# T-01 — Active classes first on "내 반" (Enter My Classes)

> **Implemented 2026-11-20.**
> - **Ordering:** `orderClassesByActivity` (`_lib/class-order.ts`, with a spec) puts active classes first.
> - **Card (revised after review):** Cove blue only. No red (it read as an alarm) and no coloured left stripe. An icon tile, the description, four stat tiles (courses, students, online, solving), a blue "LIVE / 수업 중" pill with a pulsing dot, blue tiles only for live counts above zero, a solid blue "Open live class" action when active, and a header summary "N classes live now / 지금 수업 중인 반 N개". Idle cards stay grey with a soft-blue action.
> - **Strings:** new keys in `monitoring.json`; the unused `online_count` and `solving_count` were removed.
>
> **Verified on localhost:**
> - **Mapo classes with a student in them:** they turn blue and the class with someone solving comes first; "solving" drops to 0 live when the student stops.
> - **Idle classes (development academy):** calm and grey.
> - **Languages and themes:** Korean, English, light and dark.
> - **390px:** a single column after fixing a grid that let a long description widen the card to 458px.

Registered 2026-11-05 · Jay · P3

## Request

On the teacher's "내 반" tab it is hard to see which classes have students online. QA asked to:
- sort the classes with students online first;
- show "실시간" and "풀이 중 N명" in red so they stand out.

The screenshot shows ten identical cards. "접속 1명 · 풀이 중 1명" looks the same as "접속 0명 · 풀이 중 0명".

## What is there now

- **Order:** [teaching-classes.tsx](../../../packages/web/src/app/(studio)/academy/[academySlug]/(framed)/teach/classes/_components/teaching-classes.tsx) renders the classes in server order. Live counts arrive later over the socket, and nothing re-sorts when they change.
- **Colour:** the solving count is always `text-brand` (blue), even at 0. The "실시간" badge at the top right is the connection state, not class activity.
- **Elice:** its teaching list has no live information to compare with.

## Interpretation

Making "풀이 중 0명" red would make every card red, which defeats the purpose. Implemented as:
- **Order:** classes with someone solving first (most solving first), then classes with someone online, then the rest. The original order breaks ties, so cards do not jump around without reason.
- **Emphasis only when active:** an active class gets a "LIVE" pill and highlighted "N online / N solving" figures. Inactive classes stay calm and grey. After review the emphasis is Cove blue, not the red QA suggested, because red reads as an alarm.

## Card redesign (asked for together with T-01)

Colourful, with icons, readable at a glance:
- **Icon tile:** soft Cove blue, solid when the class is live (no per-class colours, no left stripe).
- **Stat row:** icon + number + label for courses, students, online and solving. Online and solving turn blue when above zero.
- **LIVE pill:** shown on active cards.
- **Action:** a clear "실시간 반 열기 →" footer.
- **Themes and sizes:** works in light and dark, and at 390px (one column).

## Tests

- **Spec:** the ordering helper (solving desc, then online desc, then original order); inactive cards render no emphasis.
- **Localhost:** one class with a student online moves to the top and turns blue; it returns to its place when the student leaves. Checked in Korean and English, light and dark, at 390px.

## Scope

Web only. The ordering runs on counts the page already has, so no new statement.
