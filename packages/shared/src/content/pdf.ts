import { z } from "zod";

export const pdfMaxUploadBytes = 95_000_000;
export const pdfSignedUrlSeconds = 300;
export const pdfPlacementSchema = z.enum(["MAIN", "SUPPLEMENTARY", "BOTH"]);
export type PdfPlacement = z.infer<typeof pdfPlacementSchema>;
export const pdfMetadataSchema = z.object({
  placement: pdfPlacementSchema,
  revision: z.number().int().positive(),
  originalFilename: z.string(),
  byteSize: z.number().int().positive(),
  pageCount: z.number().int().positive(),
});
export type PdfMetadata = z.infer<typeof pdfMetadataSchema>;
export const pdfTargetSchema = z.object({
  academyId: z.uuid(),
  courseId: z.uuid(),
  lectureId: z.uuid(),
});
export const savePdfSchema = pdfTargetSchema.extend({
  materialId: z.uuid().optional(),
  assetId: z.uuid().optional(),
  title: z.string().trim().min(1).max(128),
  placement: pdfPlacementSchema,
  revision: z.number().int().positive().optional(),
});
export type SavePdf = z.infer<typeof savePdfSchema>;
export const pdfMaterialTargetSchema = pdfTargetSchema.extend({
  materialId: z.uuid(),
});
export const pdfReadSchema = z.object({
  academyId: z.uuid(),
  materialId: z.uuid(),
  preview: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});
export type PdfReadResult = {
  materialId: string;
  title: string;
  pdf: PdfMetadata;
  url: string;
  course: { id: string; title: string };
  lecture: { id: string; title: string };
  materials: Array<{
    materialId: string;
    title: string;
    type: "PDF_DOCUMENT" | "PROGRAMMING_EXERCISE" | "TURTLE_EXERCISE" | "WRITTEN_RESPONSE" | "MULTIPLE_CHOICE" | "VIDEO_LESSON";
    position: number;
    lectureId: string;
  }>;
  resources: Array<{
    materialId: string;
    title: string;
    originalFilename: string;
    byteSize: number;
  }>;
};
export function pdfIsMain(placement: PdfPlacement) {
  return placement !== "SUPPLEMENTARY";
}
export function pdfIsResource(placement: PdfPlacement) {
  return placement !== "MAIN";
}
