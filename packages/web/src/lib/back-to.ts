import { routes } from './routes';

/**
 * Where each detail page goes back to.
 *
 * A declared parent per route, not `router.back()`. History is not a
 * hierarchy: somebody who opened a member profile from a search result, from
 * an email, or by refreshing the page has a browser history that leads
 * somewhere unrelated — or nowhere — and a back control that lands there is
 * worse than none, because it looks reliable. A page's parent is a fact about
 * the product, so it is written down.
 *
 * Keyed by the child, named after the `routes` entry it belongs to, so the
 * pair reads as one statement: `academyPerson` sits under `academyPeople`.
 * Re-parenting a page, or moving a section, is one edit here rather than a
 * search for hand-written hrefs across a dozen `page.tsx` files.
 *
 * Only detail pages appear. A page the sidebar links to is already one press
 * from anywhere, and putting "back" above it would offer a second, worse route
 * to somewhere the reader can already see.
 *
 * The label is not here, because it is not one thing. Where the parent is a
 * sidebar destination the page uses the sidebar's own word for it, so the
 * link and the nav item agree; where the parent is a named record — a class,
 * a course — the label is that record's name, which only the page has.
 */
export const backTo = {
  /** A member's profile → the directory it is a row in. */
  academyPerson: (academySlug: string) => routes.academyPeople(academySlug),

  /** One student's ledger → the ranking that named them. */
  academyStudentPoints: (academySlug: string) =>
    routes.academyClassPoints(academySlug),

  /** A class's solution status → the list of classes taught. */
  academyTeachClass: (academySlug: string) =>
    routes.academyTeachClasses(academySlug),

  /** Progress → the class it is the progress of, not the class list. */
  academyTeachProgress: (academySlug: string, classId: string) =>
    routes.academyTeachClass(academySlug, classId),

  /**
   * One submission → the progress table it was opened from.
   *
   * Deliberately not the student, who has no page of their own here: a
   * submission is read while working down a class, and the way back is to
   * where the rest of them are.
   */
  academyTeachSubmission: (academySlug: string, classId: string) =>
    routes.academyTeachProgress(academySlug, classId),

  /** A student's class → the classes they are in. */
  academyLearnClass: (academySlug: string) =>
    routes.academyLearnClasses(academySlug),

  /** A course outline → the catalog, whichever class was used to reach it. */
  academyLearnCourse: (academySlug: string) =>
    routes.academyLearnCourses(academySlug),

  /** The import wizard → the course it is importing into. */
  academyCourseImport: (academySlug: string, courseId: string) =>
    routes.academyCourse(academySlug, courseId),

  /** An academy, and the form that creates one → the platform's list. */
  platformAcademy: () => routes.adminAcademies,
  platformAcademyNew: () => routes.adminAcademies,
} as const;
