# Monitoring students who are reading or thinking

## Approved behavior

A connected student with an open problem is Solving, including when reading,
thinking, or when the browser reports the page hidden. No inactivity timeout
removes the teacher’s Open live link. Solving describes an open problem session,
not proof of typing, attention, attendance, or counted learning time.

## Cause and decision

The previous shared resolver demoted quiet sessions after 60 seconds to Idle
(visible) or Online (hidden). The roster allowed Open live only for Solving.
Consequently teachers could not join a student who was quietly reading.

Keep the shared resolver as the authority: connected plus a material ID means
Solving. Connection interruption still means Reconnecting during recovery grace,
then Offline; no connection means Offline. Leaving the problem means Online.
Activity timestamps and existing learning-time accounting remain unchanged.

Allow legacy Idle and Online presence rows with a material ID to retain Open live
during rollout. Offline, Reconnecting, missing-problem and ineligible membership
rows remain unavailable. Existing server class/student/material authorization
continues to apply. No schema, transport, database migration or UI label is added.

Changing only the link would leave the Solving filter/count misleading. Extending
the timeout would still exclude students who spend longer thinking. Neither
alternative meets the requested behavior.

## Regression checks

- Visible and hidden quiet problem sessions remain Solving beyond 60 seconds.
- No recorded activity, even after thirty minutes, does not remove monitoring.
- Heartbeats preserve the true last-activity timestamp.
- Legacy quiet rows with a problem keep Open live.
- Missing problems, offline/reconnecting states and ineligible memberships do not.
- Existing Solving filters/counts consume the shared state without a separate rule.

Focused shared presence, API registry and web roster tests cover these rules.
Browser follow-up: leave a student problem untouched for over a minute, join from
the teacher roster, then leave the problem and disconnect to verify transitions.
The browser follow-up is not claimed as executed by the unit tests.

## Rollout

Ship API and web together and refresh clients so both use the updated shared
package. No data rewrite is required. This change does not address pointer mapping
or automatically following the student when the teacher selected another problem.
