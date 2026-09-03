import { HttpStatus, Injectable } from "@nestjs/common";
import {
  displayableEmail,
  isStaffRole,
  type AcademyProfileResponse,
  type AcademyProfileSection,
  type CodingInterest,
  type GuardianRelationship,
  type TeachingLanguage,
  type TeachingSpecialty,
} from "@cove/shared";

import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AuditService } from "../academies/audit.service.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import type { Prisma } from "../generated/prisma/client.js";
import {
  profileImageBucket,
  ProfileMediaService,
} from "./profile-media.service.js";

const membershipInclude = {
  academy: { select: { id: true, name: true, status: true } },
  user: {
    select: {
      id: true,
      displayName: true,
      email: true,
      username: true,
    },
  },
  memberProfile: { include: { avatarAsset: true } },
  studentProfile: true,
  staffProfile: true,
} as const;

type ProfileMembership = Prisma.AcademyMembershipGetPayload<{
  include: typeof membershipInclude;
}>;

/** Who is asking, and about whom. */
type ProfileActor = {
  userId: string;
  /** True when a manager is editing someone else's academy profile. */
  isManagerEdit: boolean;
};

type CommonFields = {
  academyDisplayName: string | null;
  contactPhone: string | null;
};

type StudentDetailFields = {
  dateOfBirth: string | null;
  schoolName: string | null;
  schoolGrade: string | null;
  guardianName: string | null;
  guardianRelationship: GuardianRelationship | null;
  guardianPhone: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
};

type StaffSelfFields = {
  bio: string | null;
  specialties: TeachingSpecialty[];
  teachingLanguages: TeachingLanguage[];
};

/**
 * The academy half of My Page, and the whole of the manager's member route.
 *
 * The boundary this service defends is stated once, in design §2: an academy
 * profile belongs to a *membership*. Every read and every write below resolves
 * a membership inside one academy first and works from that row, so a manager
 * of Mapo holding a Gangnam membership ID gets the same answer as a stranger.
 */
@Injectable()
export class AcademyProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: ProfileMediaService,
    private readonly audit: AuditService,
  ) {}

  /* ------------------------------------------------------------ own reads */

  async getMine(
    identity: SupabaseIdentity,
    academyId: string,
  ): Promise<AcademyProfileResponse> {
    const { membership, actor } = await this.resolveOwn(identity, academyId);
    return this.present(membership, actor);
  }

  async getForManager(
    identity: SupabaseIdentity,
    input: { academyId: string; membershipId: string },
  ): Promise<AcademyProfileResponse> {
    const { membership, actor } = await this.resolveManaged(identity, input);
    return this.present(membership, actor);
  }

  /* ----------------------------------------------------------- own writes */

  async updateMine(
    identity: SupabaseIdentity,
    input: CommonFields & { academyId: string; expectedUpdatedAt: string | null },
  ): Promise<AcademyProfileResponse> {
    const { membership, actor } = await this.resolveOwn(identity, input.academyId);
    await this.writeCommon(membership, {
      academyDisplayName: input.academyDisplayName,
      contactPhone: input.contactPhone,
    }, input.expectedUpdatedAt);
    return this.present(await this.reload(membership.id), actor);
  }

  async updateStudentDetails(
    identity: SupabaseIdentity,
    input: StudentDetailFields & {
      academyId: string;
      expectedUpdatedAt: string | null;
    },
  ): Promise<AcademyProfileResponse> {
    const { membership, actor } = await this.resolveOwn(identity, input.academyId);
    this.assertRole(membership, "STUDENT");
    await this.writeStudent(
      membership,
      studentDetailData(input),
      input.expectedUpdatedAt,
    );
    return this.present(await this.reload(membership.id), actor);
  }

  /**
   * The student's own words: what they want to build, and why.
   *
   * A separate operation from the details above precisely because a manager
   * may not write these. Splitting them means the manager form has no field to
   * carry them in, rather than a field the server has to remember to ignore.
   */
  async updateStudentSelfExpression(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      codingInterests: CodingInterest[];
      learningGoal: string | null;
      expectedUpdatedAt: string | null;
    },
  ): Promise<AcademyProfileResponse> {
    const { membership, actor } = await this.resolveOwn(identity, input.academyId);
    this.assertRole(membership, "STUDENT");
    await this.writeStudent(membership, {
      codingInterests: input.codingInterests,
      learningGoal: input.learningGoal,
    }, input.expectedUpdatedAt);
    return this.present(await this.reload(membership.id), actor);
  }

  async updateStaffProfile(
    identity: SupabaseIdentity,
    input: StaffSelfFields & {
      academyId: string;
      expectedUpdatedAt: string | null;
    },
  ): Promise<AcademyProfileResponse> {
    const { membership, actor } = await this.resolveOwn(identity, input.academyId);
    this.assertStaff(membership);
    await this.writeStaff(membership, {
      bio: input.bio,
      specialties: input.specialties,
      teachingLanguages: input.teachingLanguages,
    }, input.expectedUpdatedAt);
    return this.present(await this.reload(membership.id), actor);
  }

  /**
   * Replace one member's academy photo.
   *
   * A manager may upload for a member of their own academy; the asset stays
   * attached to that member's profile afterwards, not to the manager who
   * uploaded it. `uploaderUserId` is a record of who acted, not a claim of
   * ownership — design §9.3.
   */
  async uploadImage(
    identity: SupabaseIdentity,
    input: { academyId: string; membershipId?: string },
    file: Buffer,
  ): Promise<AcademyProfileResponse> {
    const { membership, actor } = input.membershipId
      ? await this.resolveManaged(identity, {
        academyId: input.academyId,
        membershipId: input.membershipId,
      })
      : await this.resolveOwn(identity, input.academyId);

    const image = await this.media.normalize(file);
    const assetId = this.media.newAssetId();
    const objectKey = this.media.academyObjectKey(
      membership.academyId,
      membership.id,
      assetId,
    );
    await this.prisma.mediaAsset.create({
      data: {
        id: assetId,
        bucket: profileImageBucket,
        objectKey,
        purpose: "ACADEMY_MEMBER_AVATAR",
        uploaderUserId: actor.userId,
        contentType: image.contentType,
        sizeBytes: image.bytes.byteLength,
        width: image.width,
        height: image.height,
        checksumSha256: image.checksumSha256,
      },
    });
    await this.media.upload(objectKey, image);

    try {
      const supersededId = membership.memberProfile?.avatarAssetId;
      await this.prisma.$transaction(async (transaction) => {
        await transaction.academyMemberProfile.upsert({
          where: { membershipId: membership.id },
          create: { membershipId: membership.id, avatarAssetId: assetId },
          update: { avatarAssetId: assetId },
        });
        if (supersededId) {
          await transaction.mediaAsset.update({
            where: { id: supersededId },
            data: { supersededAt: new Date() },
          });
        }
        if (actor.isManagerEdit) {
          await this.audit.write(transaction, {
            actorUserId: actor.userId,
            academyId: membership.academyId,
            action: "academy.member_profile.image_replaced",
            targetType: "AcademyMembership",
            targetId: membership.id,
            before: { hadImage: Boolean(supersededId) },
            after: { hadImage: true },
          });
        }
      });
    } catch (error) {
      await this.media.discard(objectKey);
      throw error;
    }

    return this.present(await this.reload(membership.id), actor);
  }

  async removeImage(
    identity: SupabaseIdentity,
    input: { academyId: string; membershipId?: string },
  ): Promise<AcademyProfileResponse> {
    const { membership, actor } = input.membershipId
      ? await this.resolveManaged(identity, {
        academyId: input.academyId,
        membershipId: input.membershipId,
      })
      : await this.resolveOwn(identity, input.academyId);

    const supersededId = membership.memberProfile?.avatarAssetId;
    if (supersededId) {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.academyMemberProfile.update({
          where: { membershipId: membership.id },
          data: { avatarAssetId: null },
        });
        await transaction.mediaAsset.update({
          where: { id: supersededId },
          data: { supersededAt: new Date() },
        });
        if (actor.isManagerEdit) {
          await this.audit.write(transaction, {
            actorUserId: actor.userId,
            academyId: membership.academyId,
            action: "academy.member_profile.image_removed",
            targetType: "AcademyMembership",
            targetId: membership.id,
            // The key, never the signed URL: a URL in an audit row is a
            // credential in a log.
            before: { hadImage: true },
            after: { hadImage: false },
          });
        }
      });
    }
    return this.present(await this.reload(membership.id), actor);
  }

  /* ------------------------------------------------------- manager writes */

  /**
   * The manager's save.
   *
   * One transaction, one audit record, and one revision check per section, so
   * a manager correcting a phone number cannot silently discard the school
   * name a student typed a minute earlier.
   */
  async updateForManager(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      membershipId: string;
      common: CommonFields;
      commonUpdatedAt: string | null;
      student:
        | (StudentDetailFields & { studentNumber: string | null })
        | null;
      studentUpdatedAt: string | null;
      staff:
        | (StaffSelfFields & {
          academyTitle: string | null;
          employeeNumber: string | null;
        })
        | null;
      staffUpdatedAt: string | null;
    },
  ): Promise<AcademyProfileResponse> {
    const { membership, actor } = await this.resolveManaged(identity, input);

    // A block for a role the membership does not hold is a client bug, and
    // answering it with a silent no-op would hide that from whoever wrote it.
    if (input.student && membership.role !== "STUDENT") {
      throw new AppException("PROFILE_VALIDATION_FAILED");
    }
    if (input.staff && !isStaffRole(membership.role)) {
      throw new AppException("PROFILE_VALIDATION_FAILED");
    }

    await this.runWithNumberConflict(() =>
      this.prisma.$transaction(async (transaction) => {
        await this.writeCommon(
          membership,
          input.common,
          input.commonUpdatedAt,
          transaction,
        );
        if (input.student) {
          await this.writeStudent(
            membership,
            {
              ...studentDetailData(input.student),
              studentNumber: input.student.studentNumber,
            },
            input.studentUpdatedAt,
            transaction,
          );
        }
        if (input.staff) {
          await this.writeStaff(
            membership,
            {
              bio: input.staff.bio,
              specialties: input.staff.specialties,
              teachingLanguages: input.staff.teachingLanguages,
              academyTitle: input.staff.academyTitle,
              employeeNumber: input.staff.employeeNumber,
            },
            input.staffUpdatedAt,
            transaction,
          );
        }
        await this.audit.write(transaction, {
          actorUserId: actor.userId,
          academyId: membership.academyId,
          action: "academy.member_profile.updated",
          targetType: "AcademyMembership",
          targetId: membership.id,
          before: auditSnapshot(membership),
          // Field *names* and safe values only. Nothing here carries a
          // password, a token, image bytes, or a signed URL.
          after: {
            sections: [
              "COMMON",
              ...(input.student ? ["STUDENT_DETAILS"] : []),
              ...(input.staff ? ["STAFF"] : []),
            ],
            common: input.common,
            student: input.student ?? undefined,
            staff: input.staff ?? undefined,
          },
        });
      })
    );

    return this.present(await this.reload(membership.id), actor);
  }

  /* ------------------------------------------------------------- internals */

  /**
   * The caller's own membership in one academy.
   *
   * `INVITED`, `SUSPENDED`, and `LEFT` all fail: design §12 keeps a historical
   * membership readable elsewhere but never editable through My Page.
   */
  private async resolveOwn(
    identity: SupabaseIdentity,
    academyId: string,
  ): Promise<{ membership: ProfileMembership; actor: ProfileActor }> {
    const user = await this.prisma.user.findUnique({
      where: { authUserId: identity.authUserId },
      select: { id: true, status: true },
    });
    if (!user) {
      throw new AppException("PROFILE_INCOMPLETE", HttpStatus.FORBIDDEN);
    }
    if (user.status === "SUSPENDED" || user.status === "DELETED") {
      throw new AppException("USER_SUSPENDED", HttpStatus.FORBIDDEN);
    }

    const membership = await this.prisma.academyMembership.findUnique({
      where: { academyId_userId: { academyId, userId: user.id } },
      include: membershipInclude,
    });
    if (
      !membership ||
      membership.status !== "ACTIVE" ||
      membership.academy.status !== "ACTIVE"
    ) {
      throw new AppException("PROFILE_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    return { membership, actor: { userId: user.id, isManagerEdit: false } };
  }

  /**
   * Another member's academy profile, for an active manager of that academy.
   *
   * A manager opening their own row lands here too, and the actor is then not
   * a manager edit: they are editing themselves, which is what My Page does,
   * and an audit entry for "manager edited a member" would be misleading.
   */
  private async resolveManaged(
    identity: SupabaseIdentity,
    input: { academyId: string; membershipId: string },
  ): Promise<{ membership: ProfileMembership; actor: ProfileActor }> {
    const user = await this.prisma.user.findUnique({
      where: { authUserId: identity.authUserId },
      select: { id: true, status: true },
    });
    if (!user) {
      throw new AppException("PROFILE_INCOMPLETE", HttpStatus.FORBIDDEN);
    }
    if (user.status === "SUSPENDED" || user.status === "DELETED") {
      throw new AppException("USER_SUSPENDED", HttpStatus.FORBIDDEN);
    }

    const actorMembership = await this.prisma.academyMembership.findUnique({
      where: {
        academyId_userId: { academyId: input.academyId, userId: user.id },
      },
      include: { academy: { select: { status: true } } },
    });
    // Only an active MANAGER, and only in this academy. Teachers and team
    // leads cannot edit member profiles in this release, however many classes
    // they run — design §12.
    if (
      !actorMembership ||
      actorMembership.status !== "ACTIVE" ||
      actorMembership.academy.status !== "ACTIVE" ||
      actorMembership.role !== "MANAGER"
    ) {
      throw new AppException("PROFILE_NOT_FOUND", HttpStatus.NOT_FOUND);
    }

    const membership = await this.prisma.academyMembership.findFirst({
      // Scoped by academy as well as ID: a membership ID from another academy
      // must be indistinguishable from one that does not exist.
      where: { id: input.membershipId, academyId: input.academyId },
      include: membershipInclude,
    });
    if (!membership || membership.status !== "ACTIVE") {
      throw new AppException("PROFILE_NOT_FOUND", HttpStatus.NOT_FOUND);
    }

    return {
      membership,
      actor: {
        userId: user.id,
        isManagerEdit: membership.userId !== user.id,
      },
    };
  }

  private assertRole(membership: ProfileMembership, role: "STUDENT"): void {
    if (membership.role !== role) {
      throw new AppException("PERMISSION_DENIED", HttpStatus.FORBIDDEN);
    }
  }

  private assertStaff(membership: ProfileMembership): void {
    if (!isStaffRole(membership.role)) {
      throw new AppException("PERMISSION_DENIED", HttpStatus.FORBIDDEN);
    }
  }

  /**
   * Role-specific rows are created on first edit and never deleted by a role
   * change, so a member promoted and later corrected back keeps their details.
   */
  private async writeCommon(
    membership: ProfileMembership,
    fields: CommonFields,
    expectedUpdatedAt: string | null,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    if (expectedUpdatedAt) {
      const result = await client.academyMemberProfile.updateMany({
        where: {
          membershipId: membership.id,
          updatedAt: new Date(expectedUpdatedAt),
        },
        data: fields,
      });
      if (result.count !== 1) changed();
      return;
    }
    try {
      await client.academyMemberProfile.create({
        data: { membershipId: membership.id, ...fields },
      });
    } catch (error) {
      if (isUniqueViolation(error)) changed();
      throw error;
    }
  }

  private async writeStudent(
    membership: ProfileMembership,
    fields: Prisma.StudentAcademyProfileUncheckedUpdateInput,
    expectedUpdatedAt: string | null,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    return this.runWithNumberConflict(async () => {
      if (expectedUpdatedAt) {
        const result = await client.studentAcademyProfile.updateMany({
          where: {
            membershipId: membership.id,
            updatedAt: new Date(expectedUpdatedAt),
          },
          data: fields,
        });
        if (result.count !== 1) changed();
        return;
      }
      try {
        await client.studentAcademyProfile.create({
          data: {
            ...(fields as Prisma.StudentAcademyProfileUncheckedCreateInput),
            membershipId: membership.id,
            academyId: membership.academyId,
          },
        });
      } catch (error) {
        if (isMembershipUniqueViolation(error)) changed();
        throw error;
      }
    });
  }

  private async writeStaff(
    membership: ProfileMembership,
    fields: Prisma.StaffAcademyProfileUncheckedUpdateInput,
    expectedUpdatedAt: string | null,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    return this.runWithNumberConflict(async () => {
      if (expectedUpdatedAt) {
        const result = await client.staffAcademyProfile.updateMany({
          where: {
            membershipId: membership.id,
            updatedAt: new Date(expectedUpdatedAt),
          },
          data: fields,
        });
        if (result.count !== 1) changed();
        return;
      }
      try {
        await client.staffAcademyProfile.create({
          data: {
            ...(fields as Prisma.StaffAcademyProfileUncheckedCreateInput),
            membershipId: membership.id,
            academyId: membership.academyId,
          },
        });
      } catch (error) {
        if (isMembershipUniqueViolation(error)) changed();
        throw error;
      }
    });
  }

  /**
   * Student and employee numbers are unique inside one academy, enforced by a
   * database constraint. The rejection deliberately says nothing about who
   * holds the number: uniqueness is academy-local and the message must not
   * become a way to read a roster.
   */
  private async runWithNumberConflict<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppException("PROFILE_NUMBER_CONFLICT", HttpStatus.CONFLICT);
      }
      throw error;
    }
  }

  private async reload(membershipId: string): Promise<ProfileMembership> {
    return this.prisma.academyMembership.findUniqueOrThrow({
      where: { id: membershipId },
      include: membershipInclude,
    });
  }

  /* ---------------------------------------------------------- presentation */

  private async present(
    membership: ProfileMembership,
    actor: ProfileActor,
  ): Promise<AcademyProfileResponse> {
    const isStudent = membership.role === "STUDENT";
    const [image, learning] = await Promise.all([
      membership.memberProfile?.avatarAsset
        ? this.media.sign({
          id: membership.memberProfile.avatarAsset.id,
          bucket: membership.memberProfile.avatarAsset.bucket,
          objectKey: membership.memberProfile.avatarAsset.objectKey,
        })
        : Promise.resolve(null),
      this.readLearningContext(membership),
    ]);

    const student = membership.studentProfile;
    const staff = membership.staffProfile;

    return {
      context: {
        membershipId: membership.id,
        academyId: membership.academyId,
        academyName: membership.academy.name,
        userId: membership.userId,
        globalDisplayName: membership.user.displayName,
        email: displayableEmail(membership.user.email),
        username: membership.user.username,
        role: membership.role,
        status: membership.status,
        joinedAt: membership.joinedAt?.toISOString() ?? null,
      },
      common: {
        academyDisplayName: membership.memberProfile?.academyDisplayName ?? null,
        contactPhone: membership.memberProfile?.contactPhone ?? null,
        image,
        updatedAt: membership.memberProfile?.updatedAt.toISOString() ?? null,
      },
      // The role decides the shape. A stale row from a previous role is not
      // returned, so a promoted student's guardian details stop travelling
      // with them the moment the promotion lands.
      student: isStudent && student
        ? {
          dateOfBirth: student.dateOfBirth?.toISOString().slice(0, 10) ?? null,
          schoolName: student.schoolName,
          schoolGrade: student.schoolGrade,
          guardianName: student.guardianName,
          guardianRelationship: student.guardianRelationship,
          guardianPhone: student.guardianPhone,
          emergencyContactName: student.emergencyContactName,
          emergencyContactPhone: student.emergencyContactPhone,
          codingInterests: student.codingInterests as CodingInterest[],
          learningGoal: student.learningGoal,
          studentNumber: student.studentNumber,
          updatedAt: student.updatedAt.toISOString(),
        }
        : isStudent
        ? emptyStudentProfile()
        : null,
      staff: !isStudent && staff
        ? {
          bio: staff.bio,
          specialties: staff.specialties as TeachingSpecialty[],
          teachingLanguages: staff.teachingLanguages as TeachingLanguage[],
          academyTitle: staff.academyTitle,
          employeeNumber: staff.employeeNumber,
          updatedAt: staff.updatedAt.toISOString(),
        }
        : !isStudent
        ? emptyStaffProfile()
        : null,
      classes: learning.classes,
      courses: learning.courses,
      editableSections: editableSections(membership.role, actor.isManagerEdit),
    };
  }

  /**
   * Read-only context: what this person is currently part of.
   *
   * A student sees the classes they are enrolled in and the courses those
   * classes actually expose; a teacher sees the classes they are responsible
   * for. Neither view duplicates an academy dashboard, and neither carries
   * rank, notes, or analytics — design §8.
   */
  private async readLearningContext(membership: ProfileMembership) {
    if (membership.role === "STUDENT") {
      const enrollments = await this.prisma.classEnrollment.findMany({
        where: {
          membershipId: membership.id,
          class: { academyId: membership.academyId, status: "ACTIVE" },
        },
        include: {
          class: {
            include: {
              courseAssignments: { include: { course: true } },
              _count: { select: { enrollments: true } },
            },
          },
        },
        orderBy: { enrolledAt: "asc" },
      });
      return {
        classes: enrollments.map((enrollment) => ({
          id: enrollment.class.id,
          name: enrollment.class.name,
          courseCount: enrollment.class.courseAssignments.length,
          studentCount: enrollment.class._count.enrollments,
        })),
        courses: enrollments.flatMap((enrollment) =>
          enrollment.class.courseAssignments
            // Assigning a hidden course is allowed; a student still cannot
            // open it, so listing it here would only be a broken promise.
            .filter((assignment) => assignment.course.isVisible)
            .map((assignment) => ({
              id: assignment.course.id,
              title: assignment.course.title,
              className: enrollment.class.name,
            }))
        ),
      };
    }

    const classes = await this.prisma.class.findMany({
      where: {
        academyId: membership.academyId,
        status: "ACTIVE",
        teacherMembershipId: membership.id,
      },
      include: {
        courseAssignments: { select: { courseId: true } },
        _count: { select: { enrollments: true } },
      },
      orderBy: { name: "asc" },
    });
    return {
      classes: classes.map((entry) => ({
        id: entry.id,
        name: entry.name,
        courseCount: entry.courseAssignments.length,
        studentCount: entry._count.enrollments,
      })),
      courses: [],
    };
  }
}

/* -------------------------------------------------------------- free helpers */

/**
 * What the caller may write. Computed on the server and rendered by the
 * browser: hiding a control is a layout decision, never an authorization one.
 */
export function editableSections(
  role: ProfileMembership["role"],
  isManagerEdit: boolean,
): AcademyProfileSection[] {
  if (role === "STUDENT") {
    return isManagerEdit
      // A manager reads a student's interests and learning goal. Those are
      // the student's own expression, not an academy record.
      ? ["COMMON", "STUDENT_DETAILS"]
      : ["COMMON", "STUDENT_DETAILS", "STUDENT_SELF_EXPRESSION"];
  }
  return ["COMMON", "STAFF"];
}

/**
 * A section that has never been saved still renders as a form. Returning nulls
 * rather than `null` for the whole block means the page has one code path for
 * "empty" and "filled in", and the revision check has a value to compare.
 */
function emptyStudentProfile() {
  return {
    dateOfBirth: null,
    schoolName: null,
    schoolGrade: null,
    guardianName: null,
    guardianRelationship: null,
    guardianPhone: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    codingInterests: [],
    learningGoal: null,
    studentNumber: null,
    updatedAt: null,
  };
}

function emptyStaffProfile() {
  return {
    bio: null,
    specialties: [],
    teachingLanguages: [],
    academyTitle: null,
    employeeNumber: null,
    updatedAt: null,
  };
}

function studentDetailData(fields: StudentDetailFields) {
  return {
    // A DATE column, so the value is pinned to UTC midnight rather than to
    // whatever zone the API process happens to run in.
    dateOfBirth: fields.dateOfBirth ? new Date(`${fields.dateOfBirth}T00:00:00Z`) : null,
    schoolName: fields.schoolName,
    schoolGrade: fields.schoolGrade,
    guardianName: fields.guardianName,
    guardianRelationship: fields.guardianRelationship,
    guardianPhone: fields.guardianPhone,
    emergencyContactName: fields.emergencyContactName,
    emergencyContactPhone: fields.emergencyContactPhone,
  };
}

/**
 * The "before" half of a manager audit entry.
 *
 * Names and values a manager is already allowed to see. Never a credential,
 * never image bytes, never a signed URL.
 */
function auditSnapshot(membership: ProfileMembership) {
  return {
    common: {
      academyDisplayName: membership.memberProfile?.academyDisplayName ?? null,
      contactPhone: membership.memberProfile?.contactPhone ?? null,
    },
    student: membership.studentProfile
      ? {
        dateOfBirth: membership.studentProfile.dateOfBirth
          ?.toISOString()
          .slice(0, 10) ?? null,
        schoolName: membership.studentProfile.schoolName,
        schoolGrade: membership.studentProfile.schoolGrade,
        guardianName: membership.studentProfile.guardianName,
        guardianRelationship: membership.studentProfile.guardianRelationship,
        guardianPhone: membership.studentProfile.guardianPhone,
        emergencyContactName: membership.studentProfile.emergencyContactName,
        emergencyContactPhone: membership.studentProfile.emergencyContactPhone,
        studentNumber: membership.studentProfile.studentNumber,
      }
      : null,
    staff: membership.staffProfile
      ? {
        bio: membership.staffProfile.bio,
        specialties: membership.staffProfile.specialties,
        teachingLanguages: membership.staffProfile.teachingLanguages,
        academyTitle: membership.staffProfile.academyTitle,
        employeeNumber: membership.staffProfile.employeeNumber,
      }
      : null,
  };
}

/**
 * The revision check, shared by every section.
 *
 * `null` means "this section has never been saved". A client holding that view
 * and a row that now exists is exactly the race this guards: the student saved
 * first, the manager's form still believes the section is empty, and the
 * manager's save would otherwise blank what the student wrote.
 */
export function assertUnchanged(
  actual: Date | undefined,
  expected: string | null,
): void {
  const current = actual?.toISOString() ?? null;
  if (current !== expected) {
    throw new AppException("PROFILE_CHANGED", HttpStatus.CONFLICT);
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

function isMembershipUniqueViolation(error: unknown): boolean {
  if (!isUniqueViolation(error)) return false;
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  return Array.isArray(target)
    ? target.some((field) => field === "membershipId")
    : String(target ?? "").includes("membershipId");
}

function changed(): never {
  throw new AppException("PROFILE_CHANGED", HttpStatus.CONFLICT);
}
