import { describe, expect, it } from "vitest";

import { toAcademySummary, type AcademyRecord } from "./platform-academy.mapper.js";
import { organizationNameFromSlug } from "./platform-organization.js";

const now = new Date("2026-08-18T00:00:00.000Z");

function record(overrides: Partial<AcademyRecord> = {}): AcademyRecord {
  return {
    id: "20000000-0000-4000-8000-000000000001",
    name: "DLab Gangnam",
    slug: "dlab-gangnam",
    status: "ACTIVE",
    timeZone: "Asia/Seoul",
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    statusChangedAt: null,
    memberships: [],
    invitations: [],
    ...overrides,
  };
}

describe("toAcademySummary", () => {
  it("counts only active memberships", () => {
    const summary = toAcademySummary(
      record({
        memberships: [
          { role: "MANAGER", status: "ACTIVE" },
          { role: "TEACHER", status: "ACTIVE" },
          { role: "STUDENT", status: "ACTIVE" },
          // Neither of these is a person the academy currently has.
          { role: "STUDENT", status: "SUSPENDED" },
          { role: "TEACHER", status: "LEFT" },
        ],
      }),
      now,
    );
    expect(summary.memberCounts).toEqual({
      total: 3,
      managers: 1,
      teamLeads: 0,
      teachers: 1,
      students: 1,
    });
    expect(summary.managerState).toBe("active");
  });

  it("reads a new academy as awaiting its first manager", () => {
    const summary = toAcademySummary(record(), now);
    expect(summary.managerState).toBe("awaiting_first_manager");
  });

  it("reads an academy whose manager left as needing recovery", () => {
    const summary = toAcademySummary(
      record({ memberships: [{ role: "MANAGER", status: "LEFT" }] }),
      now,
    );
    expect(summary.managerState).toBe("no_active_manager");
  });

  it("surfaces a pending manager invitation and whether it has lapsed", () => {
    const summary = toAcademySummary(
      record({
        invitations: [
          {
            email: "manager@example.com",
            expiresAt: new Date("2026-08-10T00:00:00.000Z"),
            role: "MANAGER",
            status: "PENDING",
          },
        ],
      }),
      now,
    );
    // Reported as expired even though no sweep has marked it: an operator
    // looking at a stalled academy needs the truth now, not after a cron run.
    expect(summary.pendingManagerInvitation).toEqual({
      email: "manager@example.com",
      expiresAt: "2026-08-10T00:00:00.000Z",
      isExpired: true,
    });
  });

  it("ignores invitations that are no longer outstanding", () => {
    const summary = toAcademySummary(
      record({
        invitations: [
          {
            email: "old@example.com",
            expiresAt: new Date("2026-09-01T00:00:00.000Z"),
            role: "MANAGER",
            status: "REVOKED",
          },
        ],
      }),
      now,
    );
    expect(summary.pendingManagerInvitation).toBeNull();
  });
});

describe("organizationNameFromSlug", () => {
  it("title-cases a slug into a placeholder name", () => {
    expect(organizationNameFromSlug("cove")).toBe("Cove");
    expect(organizationNameFromSlug("dlab-korea")).toBe("Dlab Korea");
  });
});
