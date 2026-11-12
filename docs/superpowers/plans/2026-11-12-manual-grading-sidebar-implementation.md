# Manual grading sidebar implementation

1. Replace the terminal grading presentation with a sidebar presentation and shared guarded right Sheet, keeping the existing publication controller and legacy card compatible.
2. Restore history Run/Saved result output; add a grading action beside its attempt selector and reuse its leave guard.
3. Expose already-loaded authorized live review data, add the live header action, and compose grading guards with the monitoring/history host. Keep selected saved tutoring work isolated from the underlying live student's grade action.
4. Update focused regressions and the isolated Chromium/WebKit scenario to cover history, live submission/help, tutoring/selector, resubmission pinning and responsive sidebar geometry. Save verification evidence and commit.
