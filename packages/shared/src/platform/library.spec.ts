import { describe, expect, it } from "vitest";

import {
  isCourseCustomized,
  libraryCourseState,
  librarySyncState,
  suggestedCopyTitle,
} from "./library.js";

describe("libraryCourseState", () => {
  it("is a draft while unpublished", () => {
    expect(libraryCourseState({ isVisible: false, retiredAt: null })).toBe(
      "DRAFT",
    );
  });

  it("is published once visible", () => {
    expect(libraryCourseState({ isVisible: true, retiredAt: null })).toBe(
      "PUBLISHED",
    );
  });

  it("reports retired over published, so a withdrawn course never reads as offered", () => {
    expect(
      libraryCourseState({
        isVisible: true,
        retiredAt: "2026-09-03T00:00:00.000Z",
      }),
    ).toBe("RETIRED");
  });

  it("reports retired over draft too", () => {
    expect(
      libraryCourseState({ isVisible: false, retiredAt: new Date() }),
    ).toBe("RETIRED");
  });
});

describe("librarySyncState", () => {
  it("is up to date while the master has not moved", () => {
    expect(
      librarySyncState({
        sourceContentRevision: 5,
        copiedAtRevision: 5,
        sourceRetiredAt: null,
      }),
    ).toBe("UP_TO_DATE");
  });

  it("offers the update once the master is ahead", () => {
    expect(
      librarySyncState({
        sourceContentRevision: 7,
        copiedAtRevision: 5,
        sourceRetiredAt: null,
      }),
    ).toBe("UPDATE_AVAILABLE");
  });

  /**
   * The precedence that matters. A retired master with a newer revision must
   * not invite a branch to re-copy something head office has withdrawn.
   */
  it("reports the retirement ahead of the update", () => {
    expect(
      librarySyncState({
        sourceContentRevision: 9,
        copiedAtRevision: 5,
        sourceRetiredAt: "2026-09-03T00:00:00.000Z",
      }),
    ).toBe("SOURCE_RETIRED");
  });

  it("reports the retirement even when the copy is current", () => {
    expect(
      librarySyncState({
        sourceContentRevision: 5,
        copiedAtRevision: 5,
        sourceRetiredAt: new Date(),
      }),
    ).toBe("SOURCE_RETIRED");
  });

  /** A master cannot go backwards, but a stale read should not claim an
   *  update either. */
  it("does not report an update when the copy is somehow ahead", () => {
    expect(
      librarySyncState({
        sourceContentRevision: 3,
        copiedAtRevision: 5,
        sourceRetiredAt: null,
      }),
    ).toBe("UP_TO_DATE");
  });
});

describe("isCourseCustomized", () => {
  it("is false on an untouched copy", () => {
    expect(
      isCourseCustomized({ contentRevision: 1, baselineRevision: 1 }),
    ).toBe(false);
  });

  it("is true once anything under the course has been edited", () => {
    expect(
      isCourseCustomized({ contentRevision: 2, baselineRevision: 1 }),
    ).toBe(true);
  });

  /** A course the academy authored itself has no baseline and is not a copy,
   *  so it can never be "customized" — there is nothing to differ from. */
  it("is false for a course that was never copied", () => {
    expect(
      isCourseCustomized({ contentRevision: 12, baselineRevision: null }),
    ).toBe(false);
  });

  /** The reason the baseline is stored rather than assumed to be 1. */
  it("respects a baseline above one", () => {
    expect(
      isCourseCustomized({ contentRevision: 4, baselineRevision: 4 }),
    ).toBe(false);
    expect(
      isCourseCustomized({ contentRevision: 5, baselineRevision: 4 }),
    ).toBe(true);
  });
});

describe("suggestedCopyTitle", () => {
  it("keeps the master's title when the academy has no clash", () => {
    expect(suggestedCopyTitle("Python Level 1", [])).toBe("Python Level 1");
  });

  it("numbers the second copy", () => {
    expect(
      suggestedCopyTitle("Python Level 1", ["Python Level 1"]),
    ).toBe("Python Level 1 (2)");
  });

  it("keeps counting past the second", () => {
    expect(
      suggestedCopyTitle("Python Level 1", [
        "Python Level 1",
        "Python Level 1 (2)",
      ]),
    ).toBe("Python Level 1 (3)");
  });

  /** The server's uniqueness check is case-insensitive, so a suggestion that
   *  differed only in case would be refused on submit. */
  it("matches existing titles without regard to case or padding", () => {
    expect(
      suggestedCopyTitle("Python Level 1", ["  python level 1  "]),
    ).toBe("Python Level 1 (2)");
  });

  it("gives up rather than looping, leaving the operator to name it", () => {
    const taken = ["Course", ...Array.from({ length: 9 }, (_, i) => `Course (${i + 2})`)];
    expect(suggestedCopyTitle("Course", taken, 10)).toBe("Course");
  });
});
