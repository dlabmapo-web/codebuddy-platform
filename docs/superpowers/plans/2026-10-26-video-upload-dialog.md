# Video upload dialog implementation

Approved design: [video upload dialog](../specs/2026-10-26-video-upload-dialog-design.md).

1. Replace the long unstyled form with a bounded dialog: one heading, close button, scrolling body, fixed footer, title counter and placement radio controls.
2. Extract the upload presentation and captions into focused components. Show actual capability limits, friendly states and progress, preserving the existing API and upload lifecycle.
3. Place description, captions and scoring in expandable sections; preserve preview, existing values and read-only permissions. Add English and Korean labels.
4. Run web typecheck, focused lint and translation tests. Verify desktop and mobile rendering in the local browser, along with keyboard/file validation and upload interactions affected by this change.

The referenced writing-plans skill is not installed in this workspace; this focused plan records the implementation and verification sequence directly.

## Completed verification

- Web typecheck passed; focused ESLint passed without warnings; whitespace checks passed.
- All 140 translation tests passed.
- Inspected the local dialog at desktop size and at 390 × 844. Confirmed no horizontal overflow and that the header and footer remain inside the viewport when expanded content receives focus. The dialog uses overflow clipping to prevent the outer container from scrolling with focus.
- Verified title character count, supplementary-only scoring disablement, optional sections, unsupported-file feedback and the configured 50 MB rejection.
- Uploaded an original synthetic three-second MP4 through the actual browser picker. Processing reached Ready to use and enabled Save. Uploaded a VTT caption and confirmed the English track appeared.
- Discarded the synthetic draft using the existing confirmation flow. No test lesson was saved in the course. Left a fresh, empty upload dialog open and restored the normal browser viewport.
- Desktop/mobile screenshots saved at `/tmp/cove-video-upload-redesign.png` and `/tmp/cove-video-upload-mobile.png`.
