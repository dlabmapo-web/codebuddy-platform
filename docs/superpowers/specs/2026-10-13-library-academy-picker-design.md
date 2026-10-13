# Copy from academy on the library page

Date: 2026-10-13
Status: Approved on 2026-10-13; implementation in progress.
Branch: `feat/academy-course-to-library`.

## Requested behavior

Provide two ways to create an independent library draft: the existing **Copy
to library** action on `/admin/content/courses`, and a new **Copy from academy**
button beside **New course** on `/admin/content/library`. The source course
remains in its academy. Publishing remains a separate admin action.

## Approaches

1. **Course picker dialog — recommended.** Keeps the admin on the library page
   and reuses existing course discovery and copy APIs.
2. **Dedicated picker page.** Gives a larger table more room, but adds navigation
   and another route for a short selection step.
3. **Link to Academy courses.** Minimal code, but does not provide the requested
   selection flow directly from the library.

## Recommended design

The new button opens a course picker dialog. It lists academy courses with
their titles, academy names, and curriculum counts. Reuse the existing TanStack `DataTable` and its search, sortable column headers,
academy faceted-filter chips (including the plus control), and pagination.
Sorting, search, and filters operate on the entire server dataset, not just the
loaded page. Sort course title, module count, and updated time using supported
API keys; academy and derived lecture/material counts are not sortable. Provide title search,
an academy filter, pagination, loading feedback, an empty state, and visible
errors. Changing search or academy resets pagination. Use the existing
`platformContent.courses` endpoint and its `academyOptions`; library-owned
courses remain excluded by the existing server query.

Selecting a course opens the shared `AcademyCourseImportDialog`. Preserve
picker search and academy selection when returning from the preview. Both
entry points use the same preview, title validation, source revision check,
asset checks, and retry request key. A successful copy closes the dialogs,
invalidates library queries, and opens the draft editor with the success
receipt. Prevent overlapping submissions. Keep API authorization unchanged
and show the new entry point only to users with all required permissions.

Place submission errors outside the scrollable outline, above the footer,
so a long course preview cannot hide a failed copy. Keep the outline
scrollable within the available dialog height.

## Observed failure and environment correction

The same Algorithm Lv2 course failed in the localhost UI with the generic
API error. The development database lacked migration
`20261013090000_library_course_imports`. It was applied to development project
`lnrmxjxsjxymgphgatwn`, and retrying the same request successfully created
an independent draft containing 2 modules, 5 lectures, and 38 programming
materials. The editor showed the success message and source receipt.
Production project `sfesugoedobirmeqjcvp` was not changed.

The verification draft is named **Copy issue verification — Algorithm Lv2**.

## Validation

Verify picker loading, search, academy filtering, pagination, empty/error
states, selection and returning from preview. Verify submission errors remain
visible with a long outline. Verify both entry points navigate to a new draft
and that the original academy course remains available. Run focused UI tests,
web type checking and lint, and exercise both flows in the local browser.

No changes to the copy transaction or new database migration are required
for this additional entry point.

## Implementation plan

1. Add a focused picker using `DataTable` in manual server mode and the existing
   course discovery API. Preserve picker state while showing the copy preview.
2. Add the permission-gated library toolbar button and required locale strings.
3. Reuse the copy dialog, add a successful-copy callback, and move submission
   errors above its footer.
4. Test server query controls, selection/return, successful dismissal, error
   visibility, then check types/lint and both entry points in the local browser.
