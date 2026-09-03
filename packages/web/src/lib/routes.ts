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
  authCallback: '/auth/callback',
  recoveryConfirm: '/auth/recovery/confirm',
  admin: '/admin',
  adminAcademies: '/admin/academies',
  adminAcademyNew: '/admin/academies/new',
  adminAcademy: (academySlug: string) =>
    `/admin/academies/${segment(academySlug)}`,
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
  academyClasses: (academySlug: string) =>
    `${academyRoot(academySlug)}/classes`,
  academyClass: (academySlug: string, classId: string) =>
    `${academyRoot(academySlug)}/classes/${segment(classId)}`,
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
  academyApplications: (academySlug: string) =>
    `${academyRoot(academySlug)}/applications`,
  academyInvitations: (academySlug: string) =>
    `${academyRoot(academySlug)}/invitations`,
  academyPoints: (academySlug: string) =>
    `${academyRoot(academySlug)}/points`,
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
