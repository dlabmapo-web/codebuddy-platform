import { HttpStatus } from "@nestjs/common";

import type { AuditService } from "../academies/audit.service.js";
import { AppException } from "../common/app-exception.js";
import type { Prisma } from "../generated/prisma/client.js";
import {
  captureTree,
  fanOut,
  releaseBlockers,
  summarize,
  writeRelease,
} from "./release.js";
import { storedReleaseView } from "./nodes.js";
import { readValues } from "./values.js";

type Tx = Prisma.TransactionClient;

export type ReleaseRow = {
  id: string;
  number: number;
  libraryContentRevision: number;
  language: "PYTHON" | "C_CPP" | "WEB";
};

export async function latestRelease(
  tx: Tx,
  libraryCourseId: string,
): Promise<ReleaseRow | null> {
  return tx.libraryRelease.findFirst({
    where: { libraryCourseId },
    orderBy: { number: "desc" },
    select: {
      id: true,
      number: true,
      libraryContentRevision: true,
      language: true,
    },
  });
}

/**
 * Publish the master's working tree as its next release, under the master's
 * row lock (the caller holds it). Refuses invalid content rather than
 * publishing it to every branch.
 */
export async function publishRelease(
  tx: Tx,
  audit: AuditService,
  input: {
    libraryCourseId: string;
    note: string;
    actorUserId: string;
    requireChanges: boolean;
  },
) {
  const previous = await latestRelease(tx, input.libraryCourseId);
  const tree = await captureTree(tx, input.libraryCourseId);
  const previousNodes = previous
    ? new Map(
        (
          await tx.libraryReleaseNode.findMany({
            where: { releaseId: previous.id },
            select: {
              nodeKey: true,
              kind: true,
              materialType: true,
              parentKey: true,
              ordinal: true,
              unitHashes: true,
            },
          })
        ).map((row) => [row.nodeKey, storedReleaseView(row)]),
      )
    : new Map();
  const summary = summarize(previousNodes, tree);
  if (
    input.requireChanges &&
    previous &&
    summary.added + summary.removed + summary.changed === 0
  )
    throw new AppException(
      "CONTENT_VALIDATION_FAILED",
      HttpStatus.CONFLICT,
      "No changes since the last release.",
    );
  const blockers = await releaseBlockers(tx, tree, true);
  if (blockers.length)
    throw new AppException(
      "CONTENT_VALIDATION_FAILED",
      HttpStatus.CONFLICT,
      `Cannot publish: ${blockers.slice(0, 5).join(", ")}`,
    );

  const number = (previous?.number ?? 0) + 1;
  const releaseId = await writeRelease(tx, {
    libraryCourseId: input.libraryCourseId,
    number,
    tree,
    note: input.note,
    publishedByUserId: input.actorUserId,
    summary,
  });
  await fanOut(tx, input.libraryCourseId, releaseId, number);
  await audit.write(tx, {
    actorUserId: input.actorUserId,
    academyId: null,
    action: "content.library_release.published",
    targetType: "Course",
    targetId: input.libraryCourseId,
    after: { number, nodeCount: tree.nodes.length, ...summary },
  });
  return {
    id: releaseId,
    number,
    libraryContentRevision: tree.contentRevision,
    language: tree.language as ReleaseRow["language"],
    summary,
  };
}

/**
 * The release an adoption copies: the latest one, or — for a master published
 * before releases existed — its initial release, captured now from the
 * working tree that adoption has always copied (design §15.1 step 2).
 */
export async function latestOrInitialRelease(
  tx: Tx,
  libraryCourseId: string,
  audit: AuditService,
): Promise<ReleaseRow> {
  const existing = await latestRelease(tx, libraryCourseId);
  if (existing) return existing;
  const master = await tx.course.findUniqueOrThrow({
    where: { id: libraryCourseId },
    select: { createdByUserId: true },
  });
  const created = await publishRelease(tx, audit, {
    libraryCourseId,
    note: "Initial release",
    actorUserId: master.createdByUserId,
    requireChanges: false,
  });
  return {
    id: created.id,
    number: created.number,
    libraryContentRevision: created.libraryContentRevision,
    language: created.language,
  };
}

export async function releaseCourseDescription(
  tx: Tx,
  releaseId: string,
  libraryCourseId: string,
): Promise<string> {
  const node = await tx.libraryReleaseNode.findUnique({
    where: { releaseId_nodeKey: { releaseId, nodeKey: libraryCourseId } },
    select: { unitHashes: true },
  });
  const hash = (node?.unitHashes as Record<string, string> | undefined)?.[
    "course.description"
  ];
  if (!hash) return "";
  const values = await readValues(tx, [hash]);
  const value = values.get(hash);
  return typeof value === "string" ? value : "";
}
