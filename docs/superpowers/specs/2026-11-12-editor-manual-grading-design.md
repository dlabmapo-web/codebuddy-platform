# Manual grading inside the editor workspace

Date: 2026-11-12
Status: implementation requested by the user, following their supplied workspace layout.

## Problem and chosen layout

The teacher history screen currently renders large grading cards above the problem/editor split. They take over half the viewport, hide the submitted code, and repeat a student-facing message to the teacher. The user requested the existing full-window problem list, description and editor, with grading in the editor's terminal area.

Keep that three-pane workspace. Manual submissions open a **Teacher grading** tab below the editor, beside **Your run**. The lower pane is resizable and scrolls independently, with the code always visible. Use Cove's existing body typography, monospace code/score values, blue focus/action tokens and editor palette. Avoid another page-level form or drawer.

Alternatives considered: a separate right-hand grading column reduces space for code; a modal hides the work being assessed. The selected lower pane preserves all three requested surfaces and reuses the existing run/result controller.

## Teacher workflow

- Show a compact pending/published status and inclusion label, without the student instruction to ask a teacher.
- Keep score/maximum and feedback together; dock completion and **Publish grade / Update grade** at the bottom.
- Corrections retain the existing reason, exact hundredths, version conflict and idempotent publication behavior.
- Review history opens inside the lower pane. Switching back preserves the form.
- Default to the immutable submitted code. **Try changes** enables a private testing copy; reset restores the submission. Private runs never change student work. Grades always apply to the selected saved submission.
- Guard both private-code edits and unsaved assessment edits when leaving/changing the attempt/material. Hide panels without unmounting the grade form when switching tabs.
- On phones, provide **Problem / Code & grading** tabs, with the existing problem list as an overlay.

## Boundaries and verification

Keep backend services, permissions, contracts, database statements and polling unchanged. Add no new fetch on mount; reuse the assessment already in the submission response. Explicit history/refresh uses the existing authorized review read.

Verify terminal-contained grading, code visibility and viewport bounds on desktop and mobile; tab switching/keyboard access; pending/published/correction/history states; unsaved changes; readonly inspection; ordinary automatic and Turtle private-run regressions. Run focused web tests, typecheck/i18n/lint and isolated Chromium/WebKit workflow checks. Do not grade the user's development submission during verification.
