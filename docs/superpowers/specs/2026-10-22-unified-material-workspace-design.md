# Consistent material workspace

Use the coding workspace's course tree and page frame for every material type. Keep Cove's typography, blue actions and existing role permissions. This implements the user's supplied layouts and request directly.

- Share a header with the course/lecture breadcrumb, material title and outline trigger. Put staff actions and Leave on the right using the same sizes, icons and colors.
- Reuse the non-modal left curriculum tree for PDFs, videos, written answers, quizzes and coding. Start with the current module and lecture expanded. Keep its desktop column and narrow-screen overlay behavior.
- Share a Previous / position / Next / Fullscreen footer. Use the entire course material order on every page, including cross-type navigation.
- Keep each material's content and execution or grading controls. Keep coding's flush/transition guard and protect unsaved assessment answers during sidebar/footer navigation.
- Continue using server capabilities for assessment and coding actions. PDF/video routes derive their action visibility from the verified academy identity; backend endpoints independently enforce all reads, edits and class assignments. PDF/video Edit opens their existing editor. Tutoring lists only genuinely assigned classes. PDFs have no answer/solution or grading operation; their tutoring link opens the class activity roster. Video tutoring opens the existing viewing-progress review.
- Extend the existing navigator path projection to supported published non-code materials. Load their hierarchy through the existing authenticated course-outline endpoint; introduce no new database or SSO permission model.

Verify Chromium and WebKit transitions across coding → written answer → PDF → quiz → short answer, shared headers/sidebar/footer, student action restrictions, staff PDF tutoring/editor, unsaved-answer cancellation, narrow-screen layout, and existing staff live-editing behavior. Exercise video layout/navigation with the local fixture separately from transcoding/playback validation.
