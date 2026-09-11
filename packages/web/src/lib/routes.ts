type QueryValue = string | number | boolean | null | undefined;

function withQuery(path: string, query?: Record<string, QueryValue>): string {
  if (!query) return path;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  const encoded = search.toString();
  return encoded ? `${path}?${encoded}` : path;
}

function segment(value: string): string {
  return encodeURIComponent(value);
}

function academyRoot(academySlug: string): string {
  return `/academy/${segment(academySlug)}`;
}

/**
 * Which door a reader used to reach a page that has more than one.
 *
 * Only the console so far, and deliberately a closed union rather than a free
 * string: the value decides where a back link points, so an unrecognised one
 * must fail to compile rather than silently fall through to the default.
 */
export const accountOrigins = ['admin'] as const;
export type AccountOrigin = (typeof accountOrigins)[number];

export function isAccountOrigin(
  value: string | undefined | null,
): value is AccountOrigin {
  return (accountOrigins as readonly string[]).includes(value ?? '');
}

/** The only public URL policy for Cove Studio. */
export const routes = {
  home: '/',
  login: '/login',
  signup: '/signup',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  welcome: '/welcome',
  pending: '/pending',
  invite: '/invite',
  invitation: (token: string) => `/invite/${segment(token)}`,
  account: '/account',
  /**
   * My Page, told where the reader came from.
   *
   * `/account` decides its own way back, and its first answer is the reader's
   * first academy — right for a member, wrong for an operator who opened it
   * from the console and holds a membership as well. The origin says which
   * door was used, so the page can send them back through it.
   *
   * A separate helper rather than a parameter on `account`: the bare address
   * stays a string for the callers that have no origin to declare, and a
   * reader of either call site can see which is which.
   */
  accountFrom: (origin: AccountOrigin) => withQuery('/account', { from: origin }),
  authCallback: '/auth/callback',
  recoveryConfirm: '/auth/recovery/confirm',
  admin: '/admin',
  adminAcademies: '/admin/academies',
  /**
   * Every academy's configuration, across all of them.
   *
   * Platform-scoped, so they belong in the console rail — unlike
   * `adminAcademySettings`, which is one academy's and belongs on it.
   */
  adminSettings: '/admin/settings',
  adminPointPolicies: '/admin/settings/points',
  /**
   * Maintenance work an operator dispatches onto the judge's queue.
   *
   * Platform-wide with an academy selector on the page, so it is
   * `adminOperations` and not one academy's route — the same distinction this
   * file already draws between `adminSettings` and `adminAcademySettings`.
   */
  adminOperations: '/admin/operations',
  adminAcademyNew: '/admin/academies/new',
  adminAcademy: (academySlug: string) =>
    `/admin/academies/${segment(academySlug)}`,
  /**
   * What one academy has switched on, and what its work pays — administered
   * from the console rather than by standing inside the academy.
   *
   * They mirror the studio's own two addresses under `/settings`, so an
   * operator who knows one product can guess the other. `points/` next door
   * stays the *reads* — a student's balance — and these are the policy.
   */
  adminAcademySettings: (academySlug: string) =>
    `/admin/academies/${segment(academySlug)}/settings`,
  adminAcademyPointPolicy: (academySlug: string) =>
    `/admin/academies/${segment(academySlug)}/settings/points`,
  adminAcademyCourses: (academySlug: string) =>
    `/admin/academies/${segment(academySlug)}/courses`,
  adminAcademyCourse: (academySlug: string, courseId: string) =>
    `/admin/academies/${segment(academySlug)}/courses/${segment(courseId)}`,
  adminAcademyClasses: (academySlug: string) =>
    `/admin/academies/${segment(academySlug)}/classes`,
  adminAcademyClass: (academySlug: string, classId: string) =>
    `/admin/academies/${segment(academySlug)}/classes/${segment(classId)}`,
  adminAcademyStudentPoints: (academySlug: string, membershipId: string) =>
    `/admin/academies/${segment(academySlug)}/points/students/${segment(membershipId)}`,
  /** The content library. It has no academy slug in its addresses: head
   *  office never sees its own curriculum addressed as a customer's academy. */
  adminLibrary: '/admin/content/library',
  adminLibraryCourse: (courseId: string) =>
    `/admin/content/library/${segment(courseId)}`,
  adminLibraryExercise: (
    courseId: string,
    lectureId: string,
    materialId: string,
  ) =>
    `/admin/content/library/${segment(courseId)}/lectures/${segment(lectureId)}/exercises/${segment(materialId)}`,
  adminAcademyExercise: (
    academySlug: string,
    courseId: string,
    lectureId: string,
    materialId: string,
  ) =>
    `/admin/academies/${segment(academySlug)}/courses/${segment(courseId)}/lectures/${segment(lectureId)}/exercises/${segment(materialId)}`,
  academy: (academySlug: string) => academyRoot(academySlug),
  /**
   * My Page, read inside the academy's own frame.
   *
   * Academy-scoped because the page is: it edits how this person appears in
   * *this* academy, and the slug fixes which one instead of a query parameter
   * and a value remembered in local storage. `routes.account` stays the
   * global address for a reader who is not standing in an academy at all.
   */
  academyMe: (academySlug: string) => `${academyRoot(academySlug)}/me`,
  academyClasses: (academySlug: string) =>
    `${academyRoot(academySlug)}/classes`,
  academyClass: (academySlug: string, classId: string) =>
    `${academyRoot(academySlug)}/classes/${segment(classId)}`,
  /**
   * Repairing the records a corrected problem left behind, inside one academy.
   *
   * The studio twin of `adminOperations`. Two routes rather than one because
   * the question differs: this one never asks which academy, and the console's
   * never assumes.
   */
  academyMaintenance: (academySlug: string) =>
    `/academy/${segment(academySlug)}/maintenance`,
  academyCourses: (academySlug: string) =>
    `${academyRoot(academySlug)}/content/courses`,
  academyCourse: (academySlug: string, courseId: string) =>
    `${academyRoot(academySlug)}/content/courses/${segment(courseId)}`,
  academyLibrary: (academySlug: string) =>
    `${academyRoot(academySlug)}/content/library`,
  academyCourseImport: (academySlug: string, courseId: string) =>
    `${academyRoot(academySlug)}/content/courses/${segment(courseId)}/imports/new`,
  academyLearnCourses: (academySlug: string) =>
    `${academyRoot(academySlug)}/learn/courses`,
  academyLearnCourse: (
    academySlug: string,
    courseId: string,
    query?: Record<string, QueryValue>,
  ) => withQuery(`${academyRoot(academySlug)}/learn/courses/${segment(courseId)}`, query),
  academyLearnClasses: (academySlug: string) =>
    `${academyRoot(academySlug)}/learn/classes`,
  academyLearnClass: (academySlug: string, classId: string) =>
    `${academyRoot(academySlug)}/learn/classes/${segment(classId)}`,
  academyLearnRecords: (
    academySlug: string,
    query?: Record<string, QueryValue>,
  ) => withQuery(`${academyRoot(academySlug)}/learn/records`, query),
  academyLearnExercise: (
    academySlug: string,
    materialId: string,
    query?: Record<string, QueryValue>,
  ) => withQuery(`${academyRoot(academySlug)}/learn/exercises/${segment(materialId)}`, query),
  academyTeachClasses: (academySlug: string) =>
    `${academyRoot(academySlug)}/teach/classes`,
  academyTeachClass: (academySlug: string, classId: string) =>
    `${academyRoot(academySlug)}/teach/classes/${segment(classId)}`,
  academyTeachProgress: (academySlug: string, classId: string) =>
    `${academyRoot(academySlug)}/teach/classes/${segment(classId)}/progress`,
  academyTeachStudentLive: (
    academySlug: string,
    classId: string,
    membershipId: string,
  ) => `${academyRoot(academySlug)}/teach/classes/${segment(classId)}/students/${segment(membershipId)}/live`,
  academyTeachSubmission: (
    academySlug: string,
    classId: string,
    membershipId: string,
    submissionId: string,
  ) => `${academyRoot(academySlug)}/teach/classes/${segment(classId)}/students/${segment(membershipId)}/submissions/${segment(submissionId)}`,
  academyTeachStudents: (academySlug: string) =>
    `${academyRoot(academySlug)}/teach/students`,
  academyPeople: (academySlug: string) =>
    `${academyRoot(academySlug)}/people`,
  academyPerson: (academySlug: string, membershipId: string) =>
    `${academyRoot(academySlug)}/people/${segment(membershipId)}`,
  academyStudents: (academySlug: string) =>
    `${academyRoot(academySlug)}/students`,
  academyStaff: (academySlug: string) => `${academyRoot(academySlug)}/staff`,
  academyApplications: (academySlug: string) =>
    `${academyRoot(academySlug)}/applications`,
  academyInvitations: (academySlug: string) =>
    `${academyRoot(academySlug)}/invitations`,
  academyPoints: (academySlug: string) =>
    `${academyRoot(academySlug)}/points`,
  /**
   * What this academy has switched on, and what each kind of work pays.
   *
   * Helpers rather than two more `${base}/settings` strings appended in a
   * sidebar. The canonical-routes lint catches hand-written `/academy/...`
   * literals, not concatenation onto a helper's result — so a second caller
   * building these by hand would pass the check and still be a second
   * definition of the address, which is the drift the check exists to stop.
   * The console reaches both, so there is now more than one caller.
   */
  academySettings: (academySlug: string) =>
    `${academyRoot(academySlug)}/settings`,
  academyPointPolicy: (academySlug: string) =>
    `${academyRoot(academySlug)}/settings/points`,
  academyClassPoints: (academySlug: string) =>
    `${academyRoot(academySlug)}/points/classes`,
  academyStudentPoints: (academySlug: string, membershipId: string) =>
    `${academyRoot(academySlug)}/points/students/${segment(membershipId)}`,
  withQuery,
} as const;

export const compatibilityRedirects = [
  { source: '/auth/login', destination: routes.login, permanent: false },
  { source: '/auth/signup', destination: routes.signup, permanent: false },
  { source: '/auth/forgot', destination: routes.forgotPassword, permanent: false },
  { source: '/auth/reset-password', destination: routes.resetPassword, permanent: false },
  { source: '/studio/my-page', destination: routes.account, permanent: false },
] as const;
