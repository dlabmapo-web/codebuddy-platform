import { z } from "zod";

/**
 * The programming language of a course, and of every coding exercise in it.
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

/** Starter code a new C or C++ exercise gets, from the editor or an import. */
export const compiledStarterTemplates = {
  C: '#include <stdio.h>\n\nint main(void) {\n\n    return 0;\n}\n',
  CPP: '#include <iostream>\nusing namespace std;\n\nint main() {\n\n    return 0;\n}\n',
} as const;
