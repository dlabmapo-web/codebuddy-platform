# Video player control visibility repair

Date: 2026-10-26

## Cause and change

The player already implemented playback controls, but its video container grew past the available lesson viewport. On the reported local lesson at a 1440 × 722 viewport, the old controls began at y=720.5 and the player extended to y=828.5. The controls therefore appeared absent behind the lesson footer.

Restored the control presentation required by the [recorded-video specification](../superpowers/specs/2026-10-12-video-learning-materials-design.md): a bounded video area and a single attached dark control bar with Cove blue seek/volume accents. The media element now fills its bounded container rather than determining its height through intrinsic dimensions. Fullscreen gives the video the remaining height while keeping the toolbar inside the fullscreen element.

The toolbar exposes play/pause/replay, seeking, time/duration, mute/volume, all seven existing playback speeds, Auto plus actual quality renditions, captions when present, and fullscreen entry/exit. Volume events synchronize the icon and slider; increasing a muted volume unmutes it. Native HLS, hls.js, MP4 fallback, watch checkpoints, and navigation remain in the existing player controller.

## Reference inspection

Reopened the requested Elice course and its first video material. The Elice shell loaded, but the embedded media player remained blank, including after reload. No claim is made that the live Elice controls were reverified in this session. The control inventory comes from the earlier [Elice inspection](2026-10-12-video-learning-materials.md) and the existing video specification.

## Verification

- Web typecheck and focused player ESLint passed; all 140 translation tests passed.
- The actual local reported video decoded after the change.
- Used the rendered controls to verify replay, pause, mute, volume, seeking, playback speed, and quality selection. Selecting 1.5× and 360p preserved paused playback. Raising the muted volume slider changed it to 0.05 and restored the Mute action; settings were subsequently restored to volume 1, speed 1× and Auto quality.
- Entered and exited player fullscreen from the active local tab. Verified the exit control appears in fullscreen. A first attempt from an inactive tab was rejected by Chrome, and the player displayed the existing fullscreen error; activating the tab allowed the normal operation.
- Verified player-focused Space toggles playback and ArrowLeft seeks backward.
- At 390 × 844, all controls remained visible with no horizontal overflow; toolbar bottom was y=400.375 and lesson footer top was y=788. Normal viewport restored afterward.
- Caption selection remains conditional on existing tracks; this reported lesson had none, so actual caption rendering was not exercised during this repair.
- Screenshots: `/tmp/cove-video-player-controls-desktop.png` and `/tmp/cove-video-player-controls-mobile.png`.

## Component selectors

Replaced the native speed, quality, and caption selects with the existing Studio `ChoiceSelector`. Added optional menu-side and content-class props so compact player triggers can open readable menus above the toolbar without changing existing selector defaults.

Web typecheck, focused ESLint, and whitespace checks passed. Browser verification selected 1.5× and 360p through the menu radio items, then restored 1× and Auto. Verified that a speed menu in fullscreen is portalled inside the player, and that its bounds fit a 390 × 844 viewport. Restored the normal viewport and left the speed menu open. Screenshot: `/tmp/cove-video-component-selectors.png`.
