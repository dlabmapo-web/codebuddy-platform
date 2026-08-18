import { describe, expect, it } from "vitest";

import {
  academyAttentionRank,
  academyStatuses,
  canTransitionAcademyStatus,
  createPlatformAcademyInputSchema,
  deriveAcademyManagerState,
  setAcademyStatusInputSchema,
  slugifyAcademyName,
} from "./academy.js";

describe("canTransitionAcademyStatus", () => {
  it("allows suspend and restore in both directions", () => {
    expect(canTransitionAcademyStatus("ACTIVE", "SUSPENDED")).toBe(true);
    expect(canTransitionAcademyStatus("SUSPENDED", "ACTIVE")).toBe(true);
  });

  it("allows archiving from either live state", () => {
    expect(canTransitionAcademyStatus("ACTIVE", "ARCHIVED")).toBe(true);
    expect(canTransitionAcademyStatus("SUSPENDED", "ARCHIVED")).toBe(true);
  });

  it("makes ARCHIVED terminal", () => {
    for (const status of academyStatuses) {
      expect(canTransitionAcademyStatus("ARCHIVED", status)).toBe(false);
    }
  });

  it("treats a move to the current state as no transition", () => {
    expect(canTransitionAcademyStatus("ACTIVE", "ACTIVE")).toBe(false);
    expect(canTransitionAcademyStatus("SUSPENDED", "SUSPENDED")).toBe(false);
  });
});

describe("deriveAcademyManagerState", () => {
  it("is active while any manager is active", () => {
    expect(deriveAcademyManagerState({ activeManagers: 1, everManagers: 3 }))
      .toBe("active");
  });

  it("is awaiting_first_manager for a freshly created academy", () => {
    expect(deriveAcademyManagerState({ activeManagers: 0, everManagers: 0 }))
      .toBe("awaiting_first_manager");
  });

  it("distinguishes an academy that lost its managers", () => {
    // The recovery case. It must not read the same as a new academy, because
    // one clears itself when an invitation is accepted and the other needs a
    // human.
    expect(deriveAcademyManagerState({ activeManagers: 0, everManagers: 2 }))
      .toBe("no_active_manager");
  });
});

describe("academyAttentionRank", () => {
  it("puts a leaderless academy above every other concern", () => {
    const rows = [
      { status: "ACTIVE", managerState: "active" },
      { status: "ARCHIVED", managerState: "no_active_manager" },
      { status: "SUSPENDED", managerState: "active" },
      { status: "ACTIVE", managerState: "no_active_manager" },
      { status: "ACTIVE", managerState: "awaiting_first_manager" },
    ] as const;
    const ordered = [...rows].sort(
      (a, b) => academyAttentionRank(a) - academyAttentionRank(b),
    );
    expect(ordered.map((row) => `${row.status}/${row.managerState}`)).toEqual([
      "ACTIVE/no_active_manager",
      "ACTIVE/awaiting_first_manager",
      "SUSPENDED/active",
      "ACTIVE/active",
      "ARCHIVED/no_active_manager",
    ]);
  });

  it("never raises an archived academy, whatever else is true of it", () => {
    expect(
      academyAttentionRank({
        status: "ARCHIVED",
        managerState: "no_active_manager",
      }),
    ).toBeGreaterThan(
      academyAttentionRank({ status: "ACTIVE", managerState: "active" }),
    );
  });
});

describe("slugifyAcademyName", () => {
  it("proposes a usable slug from an ordinary name", () => {
    expect(slugifyAcademyName("DLab Gangnam")).toBe("dlab-gangnam");
    expect(slugifyAcademyName("  Cove  Studio  ")).toBe("cove-studio");
  });

  it("strips punctuation and accents rather than encoding them", () => {
    expect(slugifyAcademyName("Café & Code!")).toBe("cafe-code");
  });

  it("leaves no trailing separator when it truncates", () => {
    const slug = slugifyAcademyName("a".repeat(40) + " " + "b".repeat(40));
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("returns an empty proposal for a name with nothing to slug", () => {
    // The form asks the operator rather than inventing one.
    expect(slugifyAcademyName("한국 아카데미")).toBe("");
  });
});

describe("platform academy inputs", () => {
  const valid = {
    name: "DLab Gangnam",
    slug: "dlab-gangnam",
    timeZone: "Asia/Seoul",
    managerEmail: "manager@example.com",
  };

  it("accepts a complete creation input", () => {
    const parsed = createPlatformAcademyInputSchema.parse(valid);
    expect(parsed.contactEmail).toBeNull();
  });

  it("rejects an unsupported time zone", () => {
    expect(
      createPlatformAcademyInputSchema.safeParse({
        ...valid,
        timeZone: "Mars/Olympus",
      }).success,
    ).toBe(false);
  });

  it("rejects a slug that would not survive a URL", () => {
    for (const slug of ["Dlab Gangnam", "dlab_gangnam", "-dlab", "dlab-"]) {
      expect(
        createPlatformAcademyInputSchema.safeParse({ ...valid, slug }).success,
      ).toBe(false);
    }
  });

  it("requires a reason on every status change", () => {
    const academyId = "20000000-0000-4000-8000-000000000001";
    expect(
      setAcademyStatusInputSchema.safeParse({
        academyId,
        status: "SUSPENDED",
      }).success,
    ).toBe(false);
    expect(
      setAcademyStatusInputSchema.safeParse({
        academyId,
        status: "SUSPENDED",
        reason: "Unpaid invoice, agreed with the director.",
      }).success,
    ).toBe(true);
  });
});
