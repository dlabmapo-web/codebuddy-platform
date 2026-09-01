import { routes } from '@/lib/routes';

export type ContentPaths = {
  courses: () => string;
  course: (courseId: string) => string;
  classes: () => string;
  class: (classId: string) => string;
  exercise: (
    courseId: string,
    lectureId: string,
    materialId: string,
  ) => string;
};

export type ContentSurface = 'academy' | 'console';

/** Build the same editor links for either route shell. */
export function createContentPaths(
  academySlug: string,
  surface: ContentSurface,
): ContentPaths {
  return surface === 'academy'
    ? {
        courses: () => routes.academyCourses(academySlug),
        course: (courseId) => routes.academyCourse(academySlug, courseId),
        classes: () => routes.academyClasses(academySlug),
        class: (classId) => routes.academyClass(academySlug, classId),
        exercise: (courseId, lectureId, materialId) =>
          `${routes.academyCourse(academySlug, courseId)}/lectures/${encodeURIComponent(lectureId)}/exercises/${encodeURIComponent(materialId)}`,
      }
    : {
        courses: () => routes.adminAcademyCourses(academySlug),
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
