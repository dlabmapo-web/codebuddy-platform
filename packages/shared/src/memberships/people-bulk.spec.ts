import { describe, expect, it } from "vitest";

import {
  bulkEligibility,
  peopleSelectionSchema,
  runBulkInputSchema,
  wouldStrandAcademy,
  type BulkOptions,
} from "./people-bulk.js";

const CLASS = "00000000-0000-4000-8000-000000000001";
const MEMBER = "00000000-0000-4000-8000-000000000002";
const ACADEMY = "00000000-0000-4000-8000-000000000003";

describe("peopleSelectionSchema", () => {
  it("accepts an explicit list of ticked rows", () => {
    expect(
      peopleSelectionSchema.parse({ mode: "ids", membershipIds: [MEMBER] }),
    ).toEqual({ mode: "ids", membershipIds: [MEMBER] });
  });

  it("accepts a filter with exclusions and fills in its defaults", () => {
    expect(
      peopleSelectionSchema.parse({ mode: "filter", search: " kim " }),
    ).toEqual({
      mode: "filter",
      search: "kim",
      roles: [],
      statuses: [],
      excludedMembershipIds: [],
    });
  });

  it("refuses a selection that is both a list and a filter", () => {
    expect(
      peopleSelectionSchema.safeParse({
        mode: "ids",
        membershipIds: [MEMBER],
        search: "kim",
      }).success,
    ).toBe(false);
  });

  it("refuses an empty explicit selection", () => {
    expect(
      peopleSelectionSchema.safeParse({ mode: "ids", membershipIds: [] })
        .success,
    ).toBe(false);
  });

  it("refuses a list longer than one transaction should carry", () => {
    expect(
      peopleSelectionSchema.safeParse({
        mode: "ids",
        membershipIds: Array.from({ length: 501 }, () => MEMBER),
      }).success,
    ).toBe(false);
  });
});

describe("runBulkInputSchema", () => {
  const base = {
    academyId: ACADEMY,
    selection: { mode: "ids" as const, membershipIds: [MEMBER] },
    idempotencyKey: "0123456789abcdef",
    peopleRevision: 4,
  };

  it("requires a class for an enrolment", () => {
    expect(
      runBulkInputSchema.safeParse({ ...base, options: { kind: "ENROLL" } })
        .success,
    ).toBe(false);
    expect(
      runBulkInputSchema.safeParse({
        ...base,
        options: { kind: "ENROLL", classId: CLASS },
      }).success,
    ).toBe(true);
  });

  it("requires a role for a role change", () => {
    expect(
      runBulkInputSchema.safeParse({
        ...base,
        options: { kind: "ROLE_CHANGE" },
      }).success,
    ).toBe(false);
  });

  it("refuses a request with no idempotency key", () => {
    const { idempotencyKey: _omitted, ...withoutKey } = base;
    expect(
      runBulkInputSchema.safeParse({
        ...withoutKey,
        options: { kind: "SUSPEND" },
      }).success,
    ).toBe(false);
  });

  it("refuses a key too short to be unique in practice", () => {
    expect(
      runBulkInputSchema.safeParse({
        ...base,
        idempotencyKey: "abc",
        options: { kind: "SUSPEND" },
      }).success,
    ).toBe(false);
  });
});

describe("bulkEligibility", () => {
  const enroll: BulkOptions = { kind: "ENROLL", classId: CLASS };

  it("enrols an active student and nobody else", () => {
    expect(
      bulkEligibility({ role: "STUDENT", status: "ACTIVE" }, enroll).eligible,
    ).toBe(true);
    expect(bulkEligibility({ role: "TEACHER", status: "ACTIVE" }, enroll)).toEqual(
      { eligible: false, code: "not_a_student" },
    );
    expect(
      bulkEligibility({ role: "STUDENT", status: "SUSPENDED" }, enroll),
    ).toEqual({ eligible: false, code: "not_active" });
  });

  it("skips a role change that changes nothing", () => {
    expect(
      bulkEligibility(
        { role: "TEACHER", status: "ACTIVE" },
        { kind: "ROLE_CHANGE", role: "TEACHER" },
      ),
    ).toEqual({ eligible: false, code: "already_in_state" });
  });

  it("skips suspending somebody already suspended", () => {
    expect(
      bulkEligibility({ role: "STUDENT", status: "SUSPENDED" }, {
        kind: "SUSPEND",
      }),
    ).toEqual({ eligible: false, code: "already_in_state" });
  });

  it("restores only a suspended membership", () => {
    expect(
      bulkEligibility({ role: "STUDENT", status: "SUSPENDED" }, {
        kind: "RESTORE",
      }).eligible,
    ).toBe(true);
    expect(
      bulkEligibility({ role: "STUDENT", status: "INVITED" }, {
        kind: "RESTORE",
      }),
    ).toEqual({ eligible: false, code: "not_suspended" });
  });

});

describe("wouldStrandAcademy", () => {
  it("blocks removing the last manager", () => {
    expect(
      wouldStrandAcademy({ activeManagers: 1, managersLosingTheRole: 1 }),
    ).toBe(true);
  });

  it("blocks selecting every manager at once", () => {
    expect(
      wouldStrandAcademy({ activeManagers: 3, managersLosingTheRole: 3 }),
    ).toBe(true);
  });

  it("allows removing one of several", () => {
    expect(
      wouldStrandAcademy({ activeManagers: 3, managersLosingTheRole: 2 }),
    ).toBe(false);
  });

  it("allows an operation that touches no manager", () => {
    expect(
      wouldStrandAcademy({ activeManagers: 1, managersLosingTheRole: 0 }),
    ).toBe(false);
  });
});
