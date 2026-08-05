# Online Student Open Live Design

## Problem

The teacher roster currently shows `Open live` only when a student is in the
`SOLVING` or `IDLE` state. A browser may report the student as `ONLINE` while
still publishing a server-verified current exercise, producing the confusing
row `Online · In an exercise` with no action. The monitoring gateway already
accepts this situation: it requires current presence with a material ID and
then revalidates teacher assignment, enrollment, class-course assignment, and
material visibility.

## Behavior

The roster may open a live workspace when all of the following are true:

- the enrollment and user are active;
- current presence contains a server-verified material ID; and
- the presence state is `ONLINE`, `SOLVING`, or `IDLE`.

The action remains unavailable for `OFFLINE` and `RECONNECTING`, or when no
current material is present. The gateway remains the final authority and
continues to reject stale or unauthorized requests.

## Implementation

Change the shared `canOpenLiveWorkspace` policy to include `ONLINE`. No route,
payload, database, or gateway change is needed. Both the roster UI and any
future consumers continue to use the shared policy instead of duplicating the
rule.

## Verification

- Extend shared policy tests for `ONLINE` with and without a material ID.
- Preserve rejection tests for `OFFLINE` and `RECONNECTING`.
- Run shared and web unit tests, repository typecheck, and the complete
  teacher live-monitoring Playwright suite.

## Out of Scope

- Opening students who have no verified current exercise.
- Monitoring disconnected or reconnecting students.
- Weakening gateway authorization or material revalidation.
