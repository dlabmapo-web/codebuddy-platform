import { z } from "zod";

/**
 * Programming languages: a course's family, and each coding exercise's own.
 *
 * Its own module because both the course schemas and the library schemas need
 * it, and `course.ts` already imports `platform/library.ts`.
 */
export const exerciseLanguages = ["PYTHON", "C", "CPP"] as const;
export const exerciseLanguageSchema = z.enum(exerciseLanguages);
export type ExerciseLanguage = z.infer<typeof exerciseLanguageSchema>;
/**
 * Languages compiled by the native GCC runtime. They run only on the server:
 * Run, Test and Submit all go to the native node, with no browser runtime and
 * no compatibility fallback.
 */
export function isCompiledLanguage(
  language: ExerciseLanguage,
): language is "C" | "CPP" {
  return language === "C" || language === "CPP";
}

/**
 * A course's language: Python, or C/C++. A C/C++ course mixes the two, each
 * problem choosing C or C++; a Python course's problems are all Python.
 */
export const courseLanguages = ["PYTHON", "C_CPP"] as const;
export const courseLanguageSchema = z.enum(courseLanguages);
export type CourseLanguage = z.infer<typeof courseLanguageSchema>;

/** The languages a course's coding problems may use. */
export function exerciseLanguagesFor(course: CourseLanguage): readonly ExerciseLanguage[] {
  return course === "C_CPP" ? ["C", "CPP"] : ["PYTHON"];
}

/** What a new coding problem in the course starts in, until its author picks. */
export function defaultExerciseLanguage(course: CourseLanguage): ExerciseLanguage {
  return course === "C_CPP" ? "C" : "PYTHON";
}

/** Starter code a new C or C++ exercise gets, from the editor or an import. */
export const compiledStarterTemplates = {
  C: '#include <stdio.h>\n\nint main(void) {\n\n    return 0;\n}\n',
  CPP: '#include <iostream>\nusing namespace std;\n\nint main() {\n\n    return 0;\n}\n',
} as const;
