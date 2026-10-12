# Video lessons implementation

Approved design: [video lessons](../specs/2026-10-12-video-learning-materials-design.md).

1. Add shared validated video/progress/caption contracts and additive private database records.
2. Implement scoped upload reservations, author CRUD, media gateway, captions, watch checkpoints and teacher history.
3. Add a separate leased media worker and production container/configuration; verify real FFmpeg processing locally.
4. Add authoring/player UI with resumable uploads, controls, subtitles, resume and end navigation.
5. Integrate mixed navigation, course/class score projections, resources and library copying.
6. Run focused tests, real Chromium/WebKit localhost E2E, storage/access checks, typechecks and builds. Document actual results and any remaining rollout work.

No production changes or deployment. The writing-plans skill is not installed in this workspace; this plan follows the approved design directly.

Implementation and local verification completed on 2026-10-12. See [verification results and production prerequisites](../../operations/video-lessons.md). Five additive migrations were applied to the guarded development database only.
