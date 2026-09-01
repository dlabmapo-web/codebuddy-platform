import type { AcademyRole, PlatformRole } from "../auth/roles.js";
import type { UserStatus } from "../auth/session.js";
import type { WorkbookLocale } from "../content/import/workbook-template.js";
import type { MembershipStatus } from "../memberships/status.js";

/**
 * The directory as a spreadsheet, shaped here rather than in the service.
 *
 * Everything below is pure: the expansion from accounts to membership rows,
 * the localized headers, the date format, the filename. That is what makes the
 * file's contents testable without a database, and it is the same split
 * `content/import/workbook-template.ts` keeps for the course workbook.
 *
 * What this file may contain is fixed by §3.2 of the console user directory
 * export design: the columns the directory *shows*, and nothing else. No
 * student or employee number — the directory searches those and does not print
 * them, and an export is the wrong place to promote a field from searchable to
 * distributed. No class, course, solve count, or active time: those are gated
 * on `platform.users.participation.read` and audited per student, and a
 * directory export holding them would be that permission bypassed by a
 * filename.
 */

/**
 * How many *accounts* one download may cover.
 *
 * Past this the request is refused rather than truncated. A file holding the
 * first five thousand of six looks complete, and the reconciliation it was
 * pulled for then comes out quietly wrong — the rule
 * `ContentImportService.buildTemplate` already applies to an oversized course.
 *
 * The cap exists because the response is built inside the request. A
 * background job with an emailed link is the answer past this scale, and this
 * is not that.
 */
export const PLATFORM_USERS_EXPORT_MAX_ACCOUNTS = 5000;

/** One membership, flattened. An account in no academy has the four
 * membership fields null and is still a row. */
export type UserExportRow = {
  name: string;
  email: string | null;
  username: string | null;
  accountStatus: UserStatus;
  platformRole: PlatformRole;
  createdAt: string;
  academyName: string | null;
  academySlug: string | null;
  role: AcademyRole | null;
  membershipStatus: MembershipStatus | null;
  joinedAt: string | null;
};

/* ------------------------------------------------------------------ copy */

type ExportCopy = {
  sheet: string;
  headers: string[];
  role: Record<AcademyRole, string>;
  accountStatus: Record<UserStatus, string>;
  membershipStatus: Record<MembershipStatus, string>;
  operator: string;
};

/**
 * Headers and enum labels, localized.
 *
 * Unlike the course import workbook, which keeps its column keys in English on
 * purpose: that file round-trips back into a reader that matches on those
 * keys, so translating them would break the upload. This one never
 * round-trips. It is read by a person, and a Korean operator should not be
 * handed a column of `TEAM_LEAD`.
 */
export const userExportCopy: Record<WorkbookLocale, ExportCopy> = {
  en: {
    sheet: "Memberships",
    headers: [
      "Name",
      "Email",
      "Username",
      "Account",
      "Platform access",
      "Signed up",
      "Academy",
      "Academy address",
      "Role",
      "Membership",
      "Member since",
    ],
    role: {
      STUDENT: "Student",
      TEACHER: "Teacher",
      TEAM_LEAD: "Team lead",
      MANAGER: "Manager",
    },
    accountStatus: {
      ACTIVE: "Active",
      PENDING_PROFILE: "Finishing signup",
      SUSPENDED: "Suspended",
      DELETED: "Deleted",
    },
    membershipStatus: {
      INVITED: "Invited",
      ACTIVE: "Active",
      SUSPENDED: "Suspended",
      LEFT: "Left",
    },
    operator: "Operator",
  },
  ko: {
    sheet: "소속",
    headers: [
      "이름",
      "이메일",
      "아이디",
      "계정",
      "플랫폼 권한",
      "가입일",
      "아카데미",
      "아카데미 주소",
      "역할",
      "소속 상태",
      "소속 시작일",
    ],
    role: {
      STUDENT: "학생",
      TEACHER: "선생님",
      TEAM_LEAD: "팀 리드",
      MANAGER: "매니저",
    },
    accountStatus: {
      ACTIVE: "활성",
      PENDING_PROFILE: "가입 진행 중",
      SUSPENDED: "정지됨",
      DELETED: "삭제됨",
    },
    membershipStatus: {
      INVITED: "초대됨",
      ACTIVE: "활성",
      SUSPENDED: "정지됨",
      LEFT: "탈퇴",
    },
    operator: "운영자",
  },
};

/* ------------------------------------------------------------------ rows */

/**
 * One account's rows: one per membership, or one blank-academy row for an
 * account belonging nowhere.
 *
 * Dropping the unaffiliated would make the file disagree with the total the
 * operator just read on the summary strip, and "accounts in no academy" is a
 * set they specifically go looking for.
 *
 * Memberships are ordered by academy name. Deliberately *not* the console's
 * `orderMemberships`, which ranks active-then-authority to decide which single
 * membership a table row should print — a different job. A file is sorted by
 * whoever opens it; what it owes them is a stable, obvious starting order.
 */
export function toUserExportRows(person: {
  displayName: string | null;
  username: string | null;
  email: string | null;
  status: UserStatus;
  platformRole: PlatformRole;
  createdAt: string;
  memberships: readonly {
    academyName: string;
    academySlug: string;
    role: AcademyRole;
    status: MembershipStatus;
    joinedAt: string | null;
  }[];
}): UserExportRow[] {
  const account = {
    // The console's own naming rule, restated in terms of the fields rather
    // than imported: `userDisplayName` lives in the web package, and the API
    // writes this file.
    name:
      person.displayName?.trim() ||
      person.username?.trim() ||
      person.email ||
      "",
    email: person.email,
    username: person.username,
    accountStatus: person.status,
    platformRole: person.platformRole,
    createdAt: person.createdAt,
  };

  if (person.memberships.length === 0) {
    return [
      {
        ...account,
        academyName: null,
        academySlug: null,
        role: null,
        membershipStatus: null,
        joinedAt: null,
      },
    ];
  }

  return [...person.memberships]
    .sort(
      (left, right) =>
        left.academyName.localeCompare(right.academyName) ||
        left.academySlug.localeCompare(right.academySlug),
    )
    .map((membership) => ({
      ...account,
      academyName: membership.academyName,
      academySlug: membership.academySlug,
      role: membership.role,
      membershipStatus: membership.status,
      joinedAt: membership.joinedAt,
    }));
}

/**
 * The rows as a sheet: a header row, then one row of strings per membership.
 *
 * Every cell is a string because the writer emits inline strings, which is
 * also what makes a display name of `=IMPORTXML(...)` text in the cell rather
 * than a formula Excel evaluates on open. §3.4.
 */
export function buildUserExportSheet(
  rows: readonly UserExportRow[],
  locale: WorkbookLocale,
  timeZone: string,
): string[][] {
  const copy = userExportCopy[locale];
  const date = dateFormatter(timeZone);

  return [
    [...copy.headers],
    ...rows.map((row) => [
      row.name,
      row.email ?? "",
      row.username ?? "",
      copy.accountStatus[row.accountStatus],
      row.platformRole === "ADMIN" ? copy.operator : "",
      date(row.createdAt),
      row.academyName ?? "",
      row.academySlug ?? "",
      row.role ? copy.role[row.role] : "",
      row.membershipStatus ? copy.membershipStatus[row.membershipStatus] : "",
      date(row.joinedAt),
    ]),
  ];
}

/**
 * `YYYY-MM-DD`, in the reader's own zone.
 *
 * Not the locale's format: a column of `08/29/2026` is ambiguous between two
 * continents, sorts as text, and is the most common way a date column arrives
 * wrong in a spreadsheet somebody else opens.
 *
 * The zone comes from the browser so the file agrees with the page the
 * operator was just reading — an account created at 23:00 UTC is the next day
 * in Seoul, and a file that disagreed with the screen by a day would be read
 * as a bug in the export. An unusable zone falls back to UTC rather than
 * throwing: a download must not fail over a header.
 */
function dateFormatter(timeZone: string): (iso: string | null) => string {
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }
  return (iso) => {
    if (!iso) return "";
    const value = new Date(iso);
    return Number.isNaN(value.getTime()) ? "" : format.format(value);
  };
}

/* -------------------------------------------------------------- filename */

const roleSlugs: Record<AcademyRole, string> = {
  STUDENT: "students",
  TEACHER: "teachers",
  TEAM_LEAD: "team-leads",
  MANAGER: "managers",
};

/**
 * What the file is called, decided by the server.
 *
 * The account count is in the name because §2.2 makes the row count and the
 * account count different numbers, and the one the operator has in their head
 * — the one on the summary strip they clicked from — is the account count.
 *
 * ASCII only, and assembled from a closed set of parts rather than from
 * anything a person typed, so it can never need escaping in a
 * `Content-Disposition` header.
 */
export function userExportFilename(input: {
  accounts: number;
  role?: AcademyRole | null;
  today: Date;
}): string {
  const who = input.role ? roleSlugs[input.role] : "users";
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(input.today);
  return `cove-${who}-${day}-${input.accounts}-accounts.xlsx`;
}
