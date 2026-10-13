import { choiceAssetIds } from "../../manual/multiple-choice.service.js";
import {
  libraryImportMaterialTypes,
  manualAssetsSchema,
  quizDefinitionSchema,
  saveManualSchema,
  videoConfigSchema,
  type AcademyCourseImportPreview,
} from "@cove/shared";
import type { Prisma } from "../../generated/prisma/client.js";
import type { CourseCopySource } from "./course-tree-copy.js";

/** Checks only authored definitions and immutable asset metadata; never reads learner data. */
export async function libraryImportBlockers(
  tx: Pick<Prisma.TransactionClient, "manualAsset" | "videoCaption">,
  source: CourseCopySource,
): Promise<AcademyCourseImportPreview["blockers"]> {
  const materials = source.modules.flatMap((module) =>
    module.lectures.flatMap((lecture) => lecture.materials),
  );
  const manifests = new Map<string, { name: string; byteSize: number }>();
  const captionIds = new Set<string>();
  const blockers: AcademyCourseImportPreview["blockers"] = [];
  const valid = new Map<
    string,
    {
      assets: Array<{ assetId: string; name: string; byteSize: number }>;
      captions: Array<{
        id: string;
        language: string;
        label: string;
        path: string;
      }>;
    }
  >();
  for (const material of materials) {
    let invalid = false;
    const assets: Array<{ assetId: string; name: string; byteSize: number }> =
      [];
    let captions: Array<{
      id: string;
      language: string;
      label: string;
      path: string;
    }> = [];
    if (!libraryImportMaterialTypes.includes(material.type)) invalid = true;
    if (
      (material.type === "PROGRAMMING_EXERCISE" &&
        !material.programmingExercise) ||
      (material.type === "PDF_DOCUMENT" && !material.pdfDocument) ||
      (material.type === "VIDEO_LESSON" && !material.videoLesson) ||
      (["TURTLE_EXERCISE", "WRITTEN_RESPONSE", "MULTIPLE_CHOICE"].includes(
        material.type,
      ) &&
        !material.manualMaterial)
    )
      invalid = true;
    if (
      material.programmingExercise?.quiz &&
      !quizDefinitionSchema.safeParse(material.programmingExercise.quiz).success
    )
      invalid = true;
    if (material.manualMaterial) {
      const config = saveManualSchema.safeParse({
        ...material.manualMaterial,
        type: material.type,
        title: material.title,
        academyId: source.academyId,
        courseId: source.id,
        lectureId: material.lectureId,
      });
      if (!config.success) invalid = true;
      else {
        assets.push(...config.data.assets, ...config.data.solutionAssets);
        const publicAssets = new Set(
          config.data.assets.map((asset) => asset.assetId),
        );
        const privateAssets = new Set(
          config.data.solutionAssets.map((asset) => asset.assetId),
        );
        const choice = config.data.multipleChoice;
        const publicHtml = [
          config.data.description,
          ...(choice
            ? [
                choice.problemDescription,
                ...choice.options.map((option) => option.content),
              ]
            : []),
        ];
        const privateHtml = [
          choice?.explanation ?? "",
          config.data.shortAnswer?.explanation ?? "",
        ];
        if (
          publicHtml.some((html) =>
            choiceAssetIds(html).some((id) => !publicAssets.has(id)),
          ) ||
          privateHtml.some((html) =>
            choiceAssetIds(html).some((id) => !privateAssets.has(id)),
          )
        )
          invalid = true;
      }
      // Check manifests separately so definitions with defaults cannot hide malformed JSON.
      if (
        !manualAssetsSchema.safeParse(material.manualMaterial.assets).success ||
        !manualAssetsSchema.safeParse(material.manualMaterial.solutionAssets)
          .success
      )
        invalid = true;
    }
    if (material.videoLesson) {
      const config = videoConfigSchema.safeParse(material.videoLesson);
      if (!config.success) invalid = true;
      else {
        assets.push(...config.data.assets);
        if (
          choiceAssetIds(config.data.description).some(
            (id) => !config.data.assets.some((asset) => asset.assetId === id),
          )
        )
          invalid = true;
        captions = config.data.captions;
      }
    }
    if (invalid)
      blockers.push({
        materialId: material.id,
        materialTitle: material.title,
        reason: "INVALID_DEFINITION",
      });
    if (
      (material.pdfDocument && material.pdfDocument.asset.state !== "READY") ||
      (material.videoLesson && material.videoLesson.asset.state !== "READY")
    )
      blockers.push({
        materialId: material.id,
        materialTitle: material.title,
        reason: "ASSET_NOT_READY",
      });
    valid.set(material.id, { assets, captions });
    for (const asset of assets) manifests.set(asset.assetId, asset);
    for (const caption of captions) captionIds.add(caption.id);
  }
  const assetRows = manifests.size
    ? await tx.manualAsset.findMany({
        where: { id: { in: [...manifests.keys()] } },
      })
    : [];
  const captionRows = captionIds.size
    ? await tx.videoCaption.findMany({ where: { id: { in: [...captionIds] } } })
    : [];
  const assets = new Map(assetRows.map((asset) => [asset.id, asset]));
  const captions = new Map(captionRows.map((caption) => [caption.id, caption]));
  for (const material of materials) {
    const config = valid.get(material.id)!;
    if (
      config.assets.some((asset) => {
        const stored = assets.get(asset.assetId);
        return (
          !stored ||
          stored.name !== asset.name ||
          stored.byteSize !== asset.byteSize
        );
      })
    )
      blockers.push({
        materialId: material.id,
        materialTitle: material.title,
        reason: "ASSET_MISSING",
      });
    if (
      config.captions.some((caption) => {
        const stored = captions.get(caption.id),
          video = material.videoLesson!;
        return (
          !stored ||
          stored.assetId !== video.assetId ||
          stored.language !== caption.language ||
          stored.label !== caption.label ||
          stored.objectKey !==
            `${video.asset.academyId}/${video.asset.id}/${caption.path}`
        );
      })
    )
      blockers.push({
        materialId: material.id,
        materialTitle: material.title,
        reason: "CAPTION_INVALID",
      });
  }
  return blockers;
}
