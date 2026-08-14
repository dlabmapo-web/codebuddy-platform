import type {
  AcademyProfileResponse,
  GuardianRelationship,
} from '@cove/shared';

import type {
  CommonDraft,
  StaffDraft,
  StudentDetailDraft,
  StudentExpressionDraft,
} from './profile-fields';

/**
 * The one place the API's nulls become the browser's empty strings, and back.
 *
 * A form field is never null — a null `value` on an input hands React an
 * uncontrolled component — and a database column never holds `""`. Doing the
 * conversion here rather than at thirty call sites is what keeps "cleared" and
 * "never filled in" the same thing everywhere.
 */
const text = (value: string | null): string => value ?? '';

export function toCommonDraft(
  response: AcademyProfileResponse,
): CommonDraft {
  return {
    academyDisplayName: text(response.common.academyDisplayName),
    contactPhone: text(response.common.contactPhone),
  };
}

export function toStudentDetailDraft(
  response: AcademyProfileResponse,
): StudentDetailDraft {
  const student = response.student;
  return {
    dateOfBirth: text(student?.dateOfBirth ?? null),
    schoolName: text(student?.schoolName ?? null),
    schoolGrade: text(student?.schoolGrade ?? null),
    guardianName: text(student?.guardianName ?? null),
    guardianRelationship: student?.guardianRelationship ?? '',
    guardianPhone: text(student?.guardianPhone ?? null),
    emergencyContactName: text(student?.emergencyContactName ?? null),
    emergencyContactPhone: text(student?.emergencyContactPhone ?? null),
    studentNumber: text(student?.studentNumber ?? null),
  };
}

export function toStudentExpressionDraft(
  response: AcademyProfileResponse,
): StudentExpressionDraft {
  return {
    codingInterests: response.student?.codingInterests ?? [],
    learningGoal: text(response.student?.learningGoal ?? null),
  };
}

export function toStaffDraft(response: AcademyProfileResponse): StaffDraft {
  const staff = response.staff;
  return {
    bio: text(staff?.bio ?? null),
    specialties: staff?.specialties ?? [],
    teachingLanguages: staff?.teachingLanguages ?? [],
    academyTitle: text(staff?.academyTitle ?? null),
    employeeNumber: text(staff?.employeeNumber ?? null),
  };
}

/* ------------------------------------------------------------- to the API */

export function fromCommonDraft(draft: CommonDraft) {
  return {
    academyDisplayName: draft.academyDisplayName,
    contactPhone: draft.contactPhone,
  };
}

export function fromStudentDetailDraft(draft: StudentDetailDraft) {
  return {
    dateOfBirth: draft.dateOfBirth,
    schoolName: draft.schoolName,
    schoolGrade: draft.schoolGrade,
    guardianName: draft.guardianName,
    // An enum has no empty member, so this one really does become null rather
    // than travelling as a string the schema would reject.
    guardianRelationship: (draft.guardianRelationship || null) as
      | GuardianRelationship
      | null,
    guardianPhone: draft.guardianPhone,
    emergencyContactName: draft.emergencyContactName,
    emergencyContactPhone: draft.emergencyContactPhone,
  };
}

export function fromStudentExpressionDraft(draft: StudentExpressionDraft) {
  return {
    codingInterests: draft.codingInterests,
    learningGoal: draft.learningGoal,
  };
}

export function fromStaffDraft(draft: StaffDraft) {
  return {
    bio: draft.bio,
    specialties: draft.specialties,
    teachingLanguages: draft.teachingLanguages,
  };
}
