import { HttpStatus, Injectable } from "@nestjs/common";
import type {
  LearnClassDetail,
  LearnClassSummary,
  LearnClassTeacher,
  LearnCourseSummary,
  MemberAvatarUrls,
} from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { enrolledClassWhere } from "../classes/assigned-course-access.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import {
  memberAvatarSelect,
  noMemberAvatar,
  resolveMemberAvatars,
} from "../profile/member-avatars.js";
import { ProfileMediaService } from "../profile/profile-media.service.js";
import {
  courseSummaryFor,
  CurriculumOutlineService,
  exerciseMaterialIds,
  nonemptyModules,
  visibleCurriculumInclude,
  type ProgressByMaterial,
} from "./curriculum-outline.service.js";

/**
 * The classes a student learns through.
 *
 * Deliberately not a mode of `ClassesService`. That service owns management
 * reads and mutations, and its responses carry the roster, membership ids,
 * emails, and lifecycle timestamps a manager arranges a class with. Teaching
 * it to omit those for one caller would put the whole privacy boundary in a
 * conditional, and the next field added to a management select would leak by
 * default. Here there is no roster to omit: nothing this file selects can name
 * another student.
 *
 * See §§6-8 of the student class pages design.
 */

/**
 * Everything one class page needs, and nothing that identifies an account.
 *
 * The teacher select carries no id, email, username, or membership — only the
 * four facts §7.2 tests, the display name it may report, and the photo shown
 * beside it. A student is being told who teaches them and what they look like,
 * not handed a way to reach them.
 */
function studentClassSelect(academyId: string) {
  return {
    id: true,
    name: true,
    description: true,
    assignedTeacher: {
      select: {
        academyId: true,
        status: true,
        role: true,
        // The same fragment the roster and the six other member surfaces use,
        // so a teacher's photo cannot resolve differently here than it does
        // anywhere else in the academy.
        ...memberAvatarSelect,
        user: {
          select: {
            ...memberAvatarSelect.user.select,
            status: true,
            displayName: true,
          },
        },
      },
    },
    courseAssignments: {
      where: { course: { academyId, isVisible: true } },
      select: { course: { include: visibleCurriculumInclude } },
      // The same ordering as the catalog, so a course does not move because a
      // student reached it through a class.
      orderBy: [{ course: { title: "asc" } }, { courseId: "asc" }],
    },
  } as const satisfies Prisma.ClassSelect;
}

type StudentClass = Prisma.ClassGetPayload<{
  select: ReturnType<typeof studentClassSelect>;
}>;

/**
 * Progress belongs to a student and an exercise, never to an access path. The
 * list reports a count and no progress, so it folds the shared projection over
 * an empty map rather than paying for a query it would not print.
 */
const noProgress: ProgressByMaterial = new Map();

@Injectable()
export class LearnClassService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccessService,
    private readonly curriculum: CurriculumOutlineService,
    private readonly media: ProfileMediaService,
  ) {}

  async listClasses(
    identity: SupabaseIdentity,
    academyId: string,
  ): Promise<{ classes: LearnClassSummary[] }> {
    const userId = await this.requireStudent(identity, academyId);
    const classes = await this.prisma.class.findMany({
      where: enrolledClassWhere(academyId, userId),
      select: studentClassSelect(academyId),
      // Class names are deliberately not unique — an academy reuses "Level 1"
      // every term — so the id settles the tie and the order holds between
      // reads.
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });

    const photos = await teacherPhotos(classes, academyId, this.media);

    return {
      classes: classes.map((record) => ({
        ...projectClass(record, academyId, photos),
        availableCourseCount: availableCourses(record, noProgress).length,
      })),
    };
  }

  async getClass(
    identity: SupabaseIdentity,
    input: { academyId: string; classId: string },
  ): Promise<LearnClassDetail> {
    const { academyId, classId } = input;
    const userId = await this.requireStudent(identity, academyId);
    const record = await this.prisma.class.findFirst({
      // The whole accessible-class predicate is in the query. Reading the class
      // by id and checking enrollment afterwards would answer a probe with a
      // different failure than a nonexistent id, which is the difference §7.1
      // exists to remove.
      where: { id: classId, ...enrolledClassWhere(academyId, userId) },
      select: studentClassSelect(academyId),
    });
    if (!record) {
      // One result for nonexistent, archived, cross-academy, and unenrolled, so
      // a guessed or remembered URL reveals nothing about which classes exist.
      throw new AppException("CLASS_NOT_FOUND", HttpStatus.NOT_FOUND);
    }

    // Hidden curriculum contributes no ids, so this asks about exactly the
    // exercises the cards will count. Existing aggregate rows answer it; no
    // student page reads submission history.
    const photos = await teacherPhotos([record], academyId, this.media);

    const statuses = await this.curriculum.statusByMaterial(
      userId,
      record.courseAssignments.flatMap((assignment) =>
        exerciseMaterialIds({ modules: nonemptyModules(assignment.course) }),
      ),
    );
    const courses = availableCourses(record, statuses);

    return {
      ...projectClass(record, academyId, photos),
      availableCourseCount: courses.length,
      courses,
    };
  }

  /**
   * The requester as an active student of this academy.
   *
   * `curriculum.read` alone is not enough. Every role holds it so staff can
   * preview the curriculum they wrote, and that preview is deliberately not a
   * way into somebody's classes: a class is a delivery relationship, and a
   * Team Lead has none.
   */
  private async requireStudent(
    identity: SupabaseIdentity,
    academyId: string,
  ): Promise<string> {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      academyId,
      "curriculum.read",
    );
    if (actor.role !== "STUDENT") {
      throw new AppException("PERMISSION_DENIED", HttpStatus.FORBIDDEN);
    }
    return actor.userId;
  }
}

function projectClass(
  record: StudentClass,
  academyId: string,
  photos: ReadonlyMap<string, MemberAvatarUrls>,
): Omit<LearnClassSummary, "availableCourseCount"> {
  return {
    classId: record.id,
    name: record.name,
    description: record.description,
    teacher: effectiveTeacher(
      record.assignedTeacher,
      academyId,
      photos.get(record.id) ?? noMemberAvatar,
    ),
  };
}

/**
 * Every teacher photo these classes will draw, signed in one round trip.
 *
 * Batched through the shared resolver for the reason it exists: a student in
 * eight classes must not cost eight storage requests. Only teachers this
 * student may actually be told about are collected, so a suspended teacher's
 * photo is never signed, let alone sent.
 *
 * A signing failure is not a page failure — the resolver returns no URLs, the
 * chain ends in the placeholder, and the card renders as it did before there
 * were photos at all.
 */
async function teacherPhotos(
  records: StudentClass[],
  academyId: string,
  media: ProfileMediaService,
): Promise<Map<string, MemberAvatarUrls>> {
  return resolveMemberAvatars(
    media,
    records.flatMap((record) => {
      const assigned = record.assignedTeacher;
      if (!assigned || !tellableTeacher(assigned, academyId)) return [];
      return [{ ...assigned, key: record.id }];
    }),
  );
}

/**
 * The courses this class currently offers, as cards.
 *
 * One function for the list's count and the detail's cards, so the two cannot
 * drift into counting assignments on one page and openable courses on the
 * other. A visible course whose whole curriculum is hidden produces no summary
 * and is therefore never counted, exactly as **My Courses** drops it.
 */
function availableCourses(
  record: StudentClass,
  statuses: ProgressByMaterial,
): LearnCourseSummary[] {
  return record.courseAssignments.flatMap(
    (assignment) => courseSummaryFor(assignment.course, statuses) ?? [],
  );
}

/**
 * The teacher a student may be told about, or nothing.
 *
 * A class keeps its assignment when the teacher is suspended, changes role, or
 * has their account closed, because a manager needs to see the stale seat to
 * clear it. None of that is a student's business, so every failure collapses
 * into the same `null` and the page reads "Teacher not assigned" either way.
 *
 * A blank display name fails with the rest rather than falling back to an
 * email, username, or id: those identify an account, and the fallback copy is
 * a better answer than an address the student was never meant to have.
 */
function effectiveTeacher(
  assigned: StudentClass["assignedTeacher"],
  academyId: string,
  avatar: MemberAvatarUrls,
): LearnClassTeacher | null {
  if (!assigned || !tellableTeacher(assigned, academyId)) return null;
  const displayName = assigned.user.displayName?.trim();
  if (!displayName) return null;
  return { displayName, ...avatar };
}

/**
 * Whether this assignment names somebody the student may be told about.
 *
 * Split out so the photo collector and the projection ask the same question.
 * If they could drift, the batch would sign an image for a teacher the
 * projection then refuses to name — work done to produce a URL for nobody, and
 * a signed URL for a person the student was not meant to learn about.
 */
function tellableTeacher(
  assigned: NonNullable<StudentClass["assignedTeacher"]>,
  academyId: string,
): boolean {
  // The stored key cannot prove same-academy on its own, so the academy is
  // checked here as well as on the class.
  if (assigned.academyId !== academyId) return false;
  if (assigned.status !== "ACTIVE" || assigned.role !== "TEACHER") return false;
  return assigned.user.status === "ACTIVE";
}
