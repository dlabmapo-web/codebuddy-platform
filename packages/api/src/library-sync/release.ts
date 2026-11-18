import { validateMaterial } from "./validate.js";
import { randomUUID } from "node:crypto";
import { HttpStatus } from "@nestjs/common";

import { AppException } from "../common/app-exception.js";
import { Prisma } from "../generated/prisma/client.js";
import { assetRefsOf } from "./asset-retention.js";
import { unitHash, valueByteSize, type CanonicalValue } from "./canonical.js";
import { masterKeyMap, projectNodes, type SyncNode } from "./catalog.js";
import { readCourseProjection } from "./projection.js";
import { existingHashes, storeValues } from "./values.js";

/**
 * Capturing a release (design §6.1). Callers own authorization and the
 * transaction; this owns the snapshot.
 *
 * The master is read in full, once, under its row lock. That is the one place
 * the whole tree crosses the wire, which is why a release has a size ceiling:
 * no production master was measured for this design (findings §11.6), so the
 * limit is a conservative supported bound rather than an observed one.
 */

export const RELEASE_MAX_BYTES = 64 * 1024 * 1024;
export const RELEASE_NOTE_MAX = 500;

type Tx = Prisma.TransactionClient;

export type ReleaseSummary = {
  added: number;
  removed: number;
  changed: number;
  byType: Record<string, number>;
};

export type CapturedTree = {
  nodes: SyncNode[];
  hashes: Map<string, Record<string, string>>;
  language: string;
  contentRevision: number;
};

export async function lockCourseRow(tx: Tx, courseId: string) {
  const rows = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT id FROM courses WHERE id = ${courseId}::uuid FOR UPDATE`;
  return rows.length === 1;
}

/** Project and hash a master's working tree. */
export async function captureTree(
  tx: Tx,
  courseId: string,
): Promise<CapturedTree> {
  const course = await readCourseProjection(tx, courseId, { mode: "full" });
  if (!course)
    throw new AppException("LIBRARY_COURSE_NOT_FOUND", HttpStatus.NOT_FOUND);
  const nodes = projectNodes(course, masterKeyMap(course.id));
  const hashes = new Map<string, Record<string, string>>();
  for (const node of nodes) {
    const unitHashes: Record<string, string> = {};
    for (const [unitKey, value] of Object.entries(node.units))
      unitHashes[unitKey] = unitHash(unitKey, value);
    hashes.set(node.key, unitHashes);
  }
  return {
    nodes,
    hashes,
    language: course.language,
    contentRevision: course.contentRevision,
  };
}

/** Why a working tree cannot be published, or null. */
export async function releaseBlockers(
  tx: Tx,
  tree: CapturedTree,
  validateContent = false,
): Promise<string[]> {
  const blockers: string[] = [];
  let bytes = 0;
  const pdfAssets = new Set<string>();
  const videoAssets = new Set<string>();
  const materials = new Map(
    tree.nodes
      .filter((node) => node.kind === "MATERIAL")
      .map((node) => [node.key, node]),
  );
  for (const node of tree.nodes) {
    for (const [unitKey, value] of Object.entries(node.units)) {
      bytes += valueByteSize(value);
      if (unitKey === "pdf.file")
        pdfAssets.add((value as { assetId: string }).assetId);
      if (unitKey === "video.media")
        videoAssets.add((value as { assetId: string }).assetId);
      if (unitKey === "exercise.referencePdf" && value !== null) {
        const target = materials.get(value as string);
        if (!target || target.materialType !== "PDF_DOCUMENT")
          blockers.push(`reference:${node.key}`);
      }
    }
  }
  if (validateContent) {
    for (const node of materials.values()) {
      const issue = validateMaterial(
        node.materialType!,
        node.units,
        {
          courseLanguage: tree.language,
          pdfAvailable: (key) => {
            const pdf = materials.get(key);
            return (
              pdf?.materialType === "PDF_DOCUMENT" &&
              pdf.units["pdf.placement"] !== "MAIN"
            );
          },
        },
        null,
      );
      if (issue) blockers.push(`material:${node.key}:${issue}`);
    }
  }
  if (bytes > RELEASE_MAX_BYTES) blockers.push("size");
  const [pdfs, videos] = await Promise.all([
    pdfAssets.size
      ? tx.$queryRaw<
          Array<{ id: string; state: string }>
        >`SELECT id, state::text AS state FROM pdf_assets WHERE id = ANY(${[...pdfAssets]}::uuid[])`
      : Promise.resolve([]),
    videoAssets.size
      ? tx.$queryRaw<
          Array<{ id: string; state: string }>
        >`SELECT id, state FROM video_assets WHERE id = ANY(${[...videoAssets]}::uuid[])`
      : Promise.resolve([]),
  ]);
  const ready = (
    rows: Array<{ id: string; state: string }>,
    wanted: Set<string>,
    kind: string,
  ) => {
    const states = new Map(rows.map((row) => [row.id, row.state]));
    for (const id of wanted)
      if (states.get(id) !== "READY") blockers.push(`${kind}:${id}`);
  };
  ready(pdfs, pdfAssets, "pdf");
  ready(videos, videoAssets, "video");
  return blockers;
}

export function summarize(
  previous: ReadonlyMap<
    string,
    {
      parentKey: string | null;
      ordinal: number;
      unitHashes: Record<string, string>;
      materialType: string | null;
      kind: string;
    }
  >,
  tree: CapturedTree,
): ReleaseSummary {
  const summary: ReleaseSummary = {
    added: 0,
    removed: 0,
    changed: 0,
    byType: {},
  };
  const bump = (label: string) =>
    (summary.byType[label] = (summary.byType[label] ?? 0) + 1);
  const current = new Set<string>();
  for (const node of tree.nodes) {
    current.add(node.key);
    const before = previous.get(node.key);
    const hashes = tree.hashes.get(node.key)!;
    const label = node.materialType ?? node.kind;
    if (!before) {
      summary.added += 1;
      bump(label);
      continue;
    }
    const keys = new Set([
      ...Object.keys(before.unitHashes),
      ...Object.keys(hashes),
    ]);
    const changed =
      before.parentKey !== node.parentKey ||
      before.ordinal !== node.ordinal ||
      [...keys].some((key) => before.unitHashes[key] !== hashes[key]);
    if (changed) {
      summary.changed += 1;
      bump(label);
    }
  }
  for (const [key, node] of previous)
    if (!current.has(key)) {
      summary.removed += 1;
      bump(node.materialType ?? node.kind);
    }
  return summary;
}

/**
 * Write a captured tree as release `number`, with its values and asset pins.
 * Returns the release id. Statement count is fixed: values (2), release (1),
 * nodes (1), asset references (1).
 */
export async function writeRelease(
  tx: Tx,
  input: {
    libraryCourseId: string;
    number: number;
    tree: CapturedTree;
    note: string;
    publishedByUserId: string;
    summary: ReleaseSummary;
  },
): Promise<string> {
  const releaseId = randomUUID();
  const entries: Array<{ hash: string; value: CanonicalValue }> = [];
  for (const node of input.tree.nodes) {
    const hashes = input.tree.hashes.get(node.key)!;
    for (const [unitKey, value] of Object.entries(node.units))
      entries.push({ hash: hashes[unitKey]!, value });
  }
  const known = await existingHashes(
    tx,
    entries.map((entry) => entry.hash),
  );
  await storeValues(
    tx,
    entries.filter((entry) => !known.has(entry.hash)),
  );

  await tx.libraryRelease.create({
    data: {
      id: releaseId,
      libraryCourseId: input.libraryCourseId,
      number: input.number,
      libraryContentRevision: input.tree.contentRevision,
      language: input.tree.language as "PYTHON",
      note: input.note,
      publishedByUserId: input.publishedByUserId,
      nodeCount: input.tree.nodes.length,
      summary: input.summary as unknown as Prisma.InputJsonValue,
    },
  });
  await tx.libraryReleaseNode.createMany({
    data: input.tree.nodes.map((node) => ({
      releaseId,
      nodeKey: node.key,
      kind: node.kind,
      materialType: (node.materialType ?? null) as never,
      parentKey: node.parentKey,
      ordinal: node.ordinal,
      unitHashes: input.tree.hashes.get(node.key)! as Prisma.InputJsonValue,
    })),
  });

  const refs = new Map<string, { assetKind: string; assetId: string }>();
  for (const node of input.tree.nodes)
    for (const [unitKey, value] of Object.entries(node.units))
      for (const ref of assetRefsOf(unitKey, value))
        refs.set(`${ref.kind}:${ref.assetId}`, {
          assetKind: ref.kind,
          assetId: ref.assetId,
        });
  if (refs.size)
    await tx.librarySyncAssetReference.createMany({
      data: [...refs.values()].map((ref) => ({
        ownerKind: "RELEASE" as const,
        ownerId: releaseId,
        assetKind: ref.assetKind as "PDF",
        assetId: ref.assetId,
      })),
      skipDuplicates: true,
    });
  return releaseId;
}

/**
 * Point every linked copy at a new release, and queue one job per copy.
 *
 * Targets only advance. A pending job is retargeted rather than duplicated;
 * a running one is left alone and the next pending job picks the new target
 * up. Jobs are queued even while draining is switched off, so turning it on
 * later misses nothing; the academy rollout gate is checked at claim.
 */
export async function fanOut(
  tx: Tx,
  libraryCourseId: string,
  releaseId: string,
  number: number,
) {
  await tx.$executeRaw`
    UPDATE course_sync_states
    SET target_release_id = ${releaseId}::uuid,
        target_release_number = ${number},
        status = CASE WHEN paused_at IS NULL THEN 'PENDING'::"LibrarySyncStatus" ELSE 'PAUSED'::"LibrarySyncStatus" END,
        updated_at = now()
    WHERE library_course_id = ${libraryCourseId}::uuid AND target_release_number < ${number}`;
  await tx.$executeRaw`
    INSERT INTO library_sync_jobs (id, copy_course_id, target_release_id, target_release_number, status, next_attempt_at)
    SELECT gen_random_uuid(), s.course_id, ${releaseId}::uuid, ${number}, 'PENDING', now()
    FROM course_sync_states s
    WHERE s.library_course_id = ${libraryCourseId}::uuid AND s.paused_at IS NULL
      AND s.applied_release_number < ${number}
    ON CONFLICT (copy_course_id) WHERE status = 'PENDING'
    DO UPDATE SET target_release_id = EXCLUDED.target_release_id,
                  target_release_number = EXCLUDED.target_release_number,
                  next_attempt_at = now()
    WHERE library_sync_jobs.target_release_number < EXCLUDED.target_release_number`;
}
