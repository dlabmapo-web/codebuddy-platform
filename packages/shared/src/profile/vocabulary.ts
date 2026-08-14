import { z } from "zod";

/**
 * The controlled vocabularies a profile chooses from.
 *
 * Codes, never display strings. A student who picks "게임 개발" and a teacher
 * who filters on "Game development" must land on the same value, and a stored
 * label would make that impossible the moment either translation is edited.
 * The client renders each code through the `profile` namespace.
 */

/** What a student says they want to build. Their own words, from a fixed set. */
export const codingInterests = [
  "GAME_DEVELOPMENT",
  "WEB_DEVELOPMENT",
  "APP_DEVELOPMENT",
  "ARTIFICIAL_INTELLIGENCE",
  "DATA_ANALYSIS",
  "ALGORITHMS",
  "ROBOTICS",
  "GRAPHICS_AND_DESIGN",
  "COMPETITIVE_PROGRAMMING",
] as const;
export const codingInterestSchema = z.enum(codingInterests);
export type CodingInterest = z.infer<typeof codingInterestSchema>;

/** How many interests one student may hold, so the chip row stays readable. */
export const codingInterestLimit = 6;

/** What a staff member teaches. */
export const teachingSpecialties = [
  "PYTHON",
  "JAVASCRIPT",
  "SCRATCH",
  "ALGORITHMS",
  "DATA_SCIENCE",
  "GAME_DEVELOPMENT",
  "WEB_DEVELOPMENT",
  "ARTIFICIAL_INTELLIGENCE",
  "ROBOTICS",
] as const;
export const teachingSpecialtySchema = z.enum(teachingSpecialties);
export type TeachingSpecialty = z.infer<typeof teachingSpecialtySchema>;

export const teachingSpecialtyLimit = 6;

/**
 * Languages a staff member can teach in. A short list on purpose: it answers
 * "can this teacher run my child's class?", not "what languages do you speak?".
 */
export const teachingLanguages = ["KO", "EN", "ZH", "JA", "RU", "UZ"] as const;
export const teachingLanguageSchema = z.enum(teachingLanguages);
export type TeachingLanguage = z.infer<typeof teachingLanguageSchema>;

export const teachingLanguageLimit = 4;

/**
 * Who the guardian is to the student. `OTHER` exists because the alternative
 * is a free-text field that would collect names, notes, and occasionally a
 * second phone number into a column nothing validates.
 */
export const guardianRelationships = [
  "MOTHER",
  "FATHER",
  "GRANDPARENT",
  "SIBLING",
  "LEGAL_GUARDIAN",
  "OTHER",
] as const;
export const guardianRelationshipSchema = z.enum(guardianRelationships);
export type GuardianRelationship = z.infer<typeof guardianRelationshipSchema>;

/**
 * Korean school years, as the codes a localized label is rendered from.
 *
 * `schoolGrade` is stored as a plain string rather than an enum: a student at
 * an international school, a gap year, or a university course has a real
 * answer that no Korean grade list contains, and rejecting it would push that
 * student to leave the field blank. A value matching one of these codes is
 * rendered localized; anything else is shown as typed.
 */
export const schoolGrades = [
  "ELEMENTARY_1",
  "ELEMENTARY_2",
  "ELEMENTARY_3",
  "ELEMENTARY_4",
  "ELEMENTARY_5",
  "ELEMENTARY_6",
  "MIDDLE_1",
  "MIDDLE_2",
  "MIDDLE_3",
  "HIGH_1",
  "HIGH_2",
  "HIGH_3",
] as const;
export type SchoolGrade = (typeof schoolGrades)[number];

const schoolGradeSet = new Set<string>(schoolGrades);

/** True when the stored value should be rendered from the localized list. */
export function isKnownSchoolGrade(value: string): value is SchoolGrade {
  return schoolGradeSet.has(value);
}
