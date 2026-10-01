# Remaining slide QA implementation

The requested scope is slides 11, 19, 27, 40, 43 and 44, plus the intermittent memory-limit verdict.

- Quiz: single-answer multiple choice as pictured on slide 43. Add a validated quiz definition to the existing exercise aggregate, preserving curriculum IDs, visibility, assignment and progress. Authoring can select programming or quiz. Quiz choices carry stable IDs, exactly one correct ID and an optional explanation. The learner projection contains choices only. Freeze the definition and answer on admission; a native quiz grading path uses the existing atomic verdict/progress/points transaction and never executes the answer as Python. Historical results retain their original question and options. Preserve the existing Python workflow and grading profiles.
- Social login: Google joins Naver behind a default-off deployment gate, checked on the server as well as before rendering the buttons. Keep provider implementation available for a future explicit deployment enablement.
- Memberships: slide 11 asks whether multiple campus memberships are intentional. Preserve that supported model and verify campus-specific authorization rather than revoke existing memberships.
- Monitoring and grading: verify paired sessions, existing five grading methods, and analyze the memory-limit failure without relaxing the assertion.

Validation includes schema/admission/dispatch regressions, permission and secret-projection checks, API and web typechecks, localized authoring/learner UI, native browser inspection and a final diff review. Completion is recorded separately from implementation and deployment.
