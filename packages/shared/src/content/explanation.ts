import { z } from "zod";
import type { LearnCourseOutline } from "./learn.js";

export const explanationBodyMaxLength = 500_000;
/** A private picture counts as content; empty editor paragraphs do not. */
export function hasExplanationContent(html: string): boolean {
  return /<img\b[^>]*\bsrc=["']cove-asset:[0-9a-f-]{36}["']/i.test(html) ||
    Boolean(html.replace(/<[^>]*>/g, "").replace(/&(?:nbsp|#160|#x0*a0);/gi, " ").trim());
}
export const explanationTargetSchema = z.object({ academyId: z.uuid(), courseId: z.uuid(), lectureId: z.uuid() });
export const saveExplanationSchema = explanationTargetSchema.extend({
  materialId: z.uuid().optional(), expectedRevision: z.number().int().positive().optional(),
  title: z.string().trim().min(1).max(200), body: z.string().max(explanationBodyMaxLength),
  isVisible: z.boolean().default(true),
}).strict().refine(value => !value.materialId || value.expectedRevision !== undefined, { path: ["expectedRevision"], message: "Load the saved explanation before editing." });
export type SaveExplanation = z.infer<typeof saveExplanationSchema>;
export const explanationReadSchema = z.object({ academyId: z.uuid(), materialId: z.uuid(), classId: z.uuid().optional(), preview: z.enum(["true", "false"]).optional().transform(v => v === "true") });
export type ExplanationRead = { academyId: string; materialId: string; classId?: string; preview?: boolean };
export type ExplanationDocument = {
  materialId: string; title: string; body: string; revision: number; isVisible: boolean;
  course: { id: string; title: string }; lecture: { id: string; title: string };
  images: Record<string, string | null>;
};
export type ExplanationReadResult = ExplanationDocument & { outline: LearnCourseOutline };

export type ExplanationAuthorContext = Pick<ExplanationDocument, "course" | "lecture">;
/** Display-only examples; this is independent of the executable course language. */
export const explanationCodeLanguages = [
  { id: "plaintext", label: "Plain text" }, { id: "python", label: "Python 3" },
  { id: "c", label: "C" }, { id: "cpp", label: "C++" },
  { id: "javascript", label: "JavaScript" }, { id: "typescript", label: "TypeScript" },
  { id: "java", label: "Java" }, { id: "html", label: "HTML" }, { id: "css", label: "CSS" },
  { id: "sql", label: "SQL" }, { id: "bash", label: "Shell" }, { id: "json", label: "JSON" },
] as const;
export function explanationCodeLanguage(value: unknown): string {
  return explanationCodeLanguages.find(item => item.id === value)?.id ?? "plaintext";
}
