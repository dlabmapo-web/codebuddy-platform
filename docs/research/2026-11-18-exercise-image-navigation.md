# Problem images disappearing after Next / Previous

## Confirmed production reproduction

At the user's request, created [QA — C lesson image navigation](https://cs.coveedu.com/academy/dlab-mapo/classes/bc02aa99-ec63-4fd2-895a-3229c6ca40ed), assigned both supplied C courses, and enrolled only `john10`. Existing classes and course content were preserved. The QA class has no scheduled class times and remains available for manual testing.

As `john10`, open the advanced C course from that class:

1. Open `[실습] C언어의 기본구조(1)` (`cbd3d8d2-b3d3-4ca8-b29d-ff67a14572fc`). Its pictures display.
2. Click **Next** to `[실습] C언어의 기본구조(2)` (`ffaa76c4-6869-47f5-a667-16075bed12fe`). Its pictures disappear, while its heading, text, and code change correctly.
3. Reload. The second problem's pictures display again.
4. Click **Previous**. The first problem's pictures now disappear.

Earlier checks in Manager and Team Lead staff practice displayed images correctly. Their normal practice navigation uses a different route transition. The confirmed failure is the retained Student coding workspace, including anyone using that same workspace.

## Cause and correction

Student programming navigation keeps the editor and runtime mounted and swaps the displayed workspace in memory. The image provider on the server page still holds the entry problem's material ID. Images unique to the next problem are therefore requested against the wrong problem; the API correctly refuses access.

The programming workspace now supplies its own image provider using the **currently displayed exercise ID**. The provider updates without remounting the editor or runtime. The page-level provider continues to serve staff practice and the separate quiz workspace. Image authorization remains unchanged.

This correction changes no database schema, SQL read path, or statement count. It needs a web deployment; it has not been deployed to production.

## Verification

- Added an isolated browser fixture with three programming problems and three distinct private image assets. The real API checks each image's material scope and reads the local storage double.
- Before the correction, the Chromium regression failed at problem 2: `Picture for problem 2` was absent after **Next**, matching production.
- After the correction, the regression passes in **Chromium and WebKit** through Next, Previous, outline selection, browser Back/Forward, and repeated navigation.
- The browser test verifies decoded images (`complete` and `naturalWidth > 0`) and retains the same Monaco DOM node and page marker throughout.
- Focused web tests: **19 passed** (navigation lifecycle, workspace sample results, private image rendering).
- API checks: **51 passed** in the disposable PostgreSQL harness; private exercise-image authorization tests: **5 passed**.
- Web and E2E typechecks, targeted workspace ESLint, and `git diff --check` passed. The harness also compiled the API.
- Disposable database/Redis and temporary API/provider/web servers were cleaned up. Port 4000 is free.

Reproduce the browser checks locally:

```sh
bash packages/api/scripts/test-material-loading.sh exercise-image-navigation.spec.ts
```

## Screenshots of the corrected branch

These screenshots come from isolated localhost fixtures, not modified production lessons.

| Check | Chromium | WebKit |
| --- | --- | --- |
| Next to problem 2 | [Screenshot](assets/2026-11-18-exercise-image-navigation/chromium-next-image-visible.png) | [Screenshot](assets/2026-11-18-exercise-image-navigation/webkit-next-image-visible.png) |
| Return after repeated navigation | [Screenshot](assets/2026-11-18-exercise-image-navigation/chromium-repeated-navigation-image-visible.png) | [Screenshot](assets/2026-11-18-exercise-image-navigation/webkit-repeated-navigation-image-visible.png) |
