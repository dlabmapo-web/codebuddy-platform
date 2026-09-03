import { routes } from '@/lib/routes';

export type ContentPaths = {
  courses: () => string;
  /** Where this surface browses published master courses. */
  library: () => string;
  course: (courseId: string) => string;
  classes: () => string;
  class: (classId: string) => string;
  exercise: (
    courseId: string,
    lectureId: string,
    materialId: string,
  ) => string;
};

export type ContentSurface = 'academy' | 'console' | 'library';

/**
 * Build the same editor links for whichever route shell is mounting them.
 *
 * Three surfaces, one set of editors. `library` ignores `academySlug`
 * entirely — a library course's address carries no academy, because head
 * office is not standing in one — and it has no classes, because a library
 * holds courses and nothing else.
 */
export function createContentPaths(
  academySlug: string,
  surface: ContentSurface,
): ContentPaths {
  if (surface === 'library') {
    const noClasses = () => routes.adminLibrary;
    return {
      courses: () => routes.adminLibrary,
      library: () => routes.adminLibrary,
      course: (courseId) => routes.adminLibraryCourse(courseId),
      classes: noClasses,
      class: noClasses,
      exercise: (courseId, lectureId, materialId) =>
        routes.adminLibraryExercise(courseId, lectureId, materialId),
    };
  }
  return surface === 'academy'
    ? {
        courses: () => routes.academyCourses(academySlug),
        library: () => routes.academyLibrary(academySlug),
        course: (courseId) => routes.academyCourse(academySlug, courseId),
        classes: () => routes.academyClasses(academySlug),
        class: (classId) => routes.academyClass(academySlug, classId),
        exercise: (courseId, lectureId, materialId) =>
          `${routes.academyCourse(academySlug, courseId)}/lectures/${encodeURIComponent(lectureId)}/exercises/${encodeURIComponent(materialId)}`,
      }
    : {
        // The console browses a customer's courses, and the library it can
        // reach is the platform's own — there is no per-academy library page
        // under `/admin/academies`, because adopting is the academy's act.
        courses: () => routes.adminAcademyCourses(academySlug),
        library: () => routes.adminLibrary,
        course: (courseId) => routes.adminAcademyCourse(academySlug, courseId),
        classes: () => routes.adminAcademyClasses(academySlug),
        class: (classId) => routes.adminAcademyClass(academySlug, classId),
        exercise: (courseId, lectureId, materialId) =>
          routes.adminAcademyExercise(
            academySlug,
            courseId,
            lectureId,
            materialId,
          ),
      };
}
