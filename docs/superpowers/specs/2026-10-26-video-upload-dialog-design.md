# Video upload dialog redesign

Date: 2026-10-26
Status: Approved by the user on 2026-10-26

## Goal and reference

Make uploading a recorded lesson clear and comfortable using the layout of Elice's **New Material → Video File** dialog and Cove's existing visual identity.

Inspected the signed-in [reference course](https://dlab.elice.io/courses/765886/lectures/all) and its introductory lecture on 2026-10-26. Opened the new-material picker, selected Video File, inspected the single-upload form and scrolled its body, then cancelled without uploading or saving.

The observed creation dialog has one header and close button, a required title with a character counter, three vertically stacked placement radio options, a large clickable drop zone, supported-format/size/duration guidance, a scrollable body, and a fixed Save/Cancel footer. Its single/multiple upload selector describes different creation modes. Cove currently creates one lesson at a time; batch creation is outside this change.

## Approach

Recommended: a focused upload dialog based on the observed Elice creation flow. It keeps authors on the course outline and makes title, placement, and video the primary tasks.

Alternative: a full-page editor provides more room for long descriptions and previews but changes navigation and exceeds the upload-dialog request. Merely restyling the existing long form would leave optional controls competing with the upload task.

## Layout

```text
┌──────────────────────────────────────────────────┐
│ Video lesson                                  ×  │
├──────────────────────────────────────────────────┤
│ Title *                                          │
│ [Enter a lesson title                    0 / 128] │
│                                                  │
│ Placement                                        │
│ ◉ Main material                                  │
│ ○ Main and supplementary                         │
│ ○ Supplementary only                             │
│ Short explanation of supplementary placement     │
│                                                  │
│ Video file *                                     │
│ ┌──────────────────────────────────────────────┐ │
│ │                 Upload icon                  │ │
│ │       Choose a video or drag it here          │ │
│ └──────────────────────────────────────────────┘ │
│ Supported formats · Actual limit · Up to 6 hours  │
│                                                  │
│ ▸ Description                         Optional   │
│ ▸ Captions                            Optional   │
│ ▸ Scoring                                        │
├──────────────────────────────────────────────────┤
│ New videos start hidden.      Cancel  Save video │
└──────────────────────────────────────────────────┘
```

Use a roughly 760–800 px maximum width and a viewport-bounded height. The header and footer do not scroll; the body uses `min-height: 0` and vertical overflow. The mobile layout fits narrow viewports, wraps file names and guidance, and keeps actions visible without horizontal scrolling. Use one accessible dialog title; remove the duplicate heading.

Reuse Cove's Pretendard typography and semantic color tokens: brand `#1B64DA`, brand-soft `#EAF1FE`, ink `#16181D`, sub `#5A6270`, card and border tokens. Existing dark-theme tokens supply the dark palette. Use 14 px body/field text, a 17–20 px heading, consistent section spacing, and restrained rounded borders. The upload zone is the main visual emphasis.

## Upload and optional details

The whole upload zone is clickable and keyboard accessible through its labelled file input. Dragging a file highlights its border and background in Cove blue. Show an uploaded-file row with filename, readable size, a progress bar, and friendly status text. Separate uploading from processing; retain pause/resume and transient retry actions. Errors remain readable alongside recovery controls.

Fetch capabilities when opening the dialog so guidance displays the effective server limit before selection (currently 50 MB in development), rather than advertising 5 GB as the effective limit. Keep the supported extension and six-hour duration guidance. Do not claim readiness from upload completion.

Description, Captions, and Scoring use expandable sections. Existing descriptions and caption tracks remain discoverable when editing. Caption controls retain language, display label, VTT validation, and track removal. Explain that captions become available after the video is ready. Scoring retains include/exclude and maximum score, and remains unavailable for supplementary-only placement. Preview remains available for a saved ready lesson.

Preserve the existing reservation, TUS upload, processing polling, save/revision, hidden-by-default publication, private assets, and discard/cancel contracts. Respect read-only author permissions for every control. Save remains available for ready/processing/verifying assets according to the existing API contract; the footer communicates that processing must finish before publication. This redesign does not add batch uploads, new material types, or backend changes.

## Implementation boundary

Update the video author dialog and focused child presentation components where this keeps upload, caption, and optional-section markup understandable. Reuse existing modal/input primitives without changing other material dialogs. Add English and Korean strings for the new guidance and status labels. Retain the existing client-component boundary and private-media API.

## Acceptance and verification

- The first view exposes title, placement, and a clear video picker; no duplicate heading or raw unstyled file control dominates the form.
- Save and Cancel remain visible while scrolling optional content, on desktop and a narrow mobile viewport.
- Keyboard focus, labelled fields, placement radio semantics, upload progress, and disabled states remain usable.
- Effective upload limit appears before selection; oversize/unsupported selection produces clear feedback.
- Upload → processing → ready, pause/resume, save, captions, preview, and discard retain their current behavior.
- Verify the actual rendered local form in the browser at desktop and mobile sizes; exercise a small original synthetic video in a disposable development fixture if upload behavior changes.
- Run web typecheck, focused lint, and the translation checks. Add focused behavior coverage only for changed validation/state behavior rather than testing CSS implementation details.

## Review

Scope and requirements checked for placeholders, contradictions, and ambiguous publication behavior. The user approved the Elice-style dialog layout on 2026-10-26. Implementation may proceed.
