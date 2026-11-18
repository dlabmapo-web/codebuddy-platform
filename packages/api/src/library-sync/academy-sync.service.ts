import { HttpStatus, Injectable, Optional } from "@nestjs/common";
import { NotificationBroadcaster } from "../notifications/notification-broadcaster.js";
import { refreshReviewItems } from "./review-projection.js";
import { LibraryReviewPreviews } from "./review-previews.service.js";
import {
  linkedSyncChip,
  type AcademyCourseSync,
  type AcademyLibrarySyncUpdates,
  type LibrarySyncConflict,
  type LibrarySyncConflictDetail,
  type LibrarySyncResolution,
  type ResolveLibrarySyncConflictInput,
  type SyncValue,
} from "@cove/shared";

import { AuditService } from "../academies/audit.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { sanitizeExplanation } from "../explanations/explanation-html.js";
import type { Prisma } from "../generated/prisma/client.js";
import { sanitizeChoiceHtml } from "../manual/multiple-choice.service.js";
import { MonitoringRevocationService } from "../monitoring/monitoring-revocation.service.js";
import {
  big,
  canonicalJson,
  isBig,
  sha256Hex,
  unitHash,
  type CanonicalValue,
} from "./canonical.js";
import { copyKeyMap, projectNodes, type SyncNode } from "./catalog.js";
import { oursView } from "./nodes.js";
import type { Plan } from "./merge/plan.js";
import { readCourseProjection } from "./projection.js";
import { runCopySync } from "./sync-run.js";
import { validateMaterial } from "./validate.js";
import { readValues, storeValues } from "./values.js";
import { applyPlan, mergedUnitsFor } from "./writer.js";

/**
 * Library course sync, as an academy's editors read and decide it
 * (design §§13, 16, 18.2). Values are read only through a conflict of this
 * academy's own copy, never by bare hash.
 */

type Tx = Prisma.TransactionClient;

type UpdatesStateRow = {
  unmatched_count: number;
  library_course_id: string;
  library_title: string;
  retired_at: Date | null;
  applied_release_number: number;
  target_release_number: number;
  status: string;
  open_conflict_count: number;
  divergent_unit_count: number;
  last_run_at: Date | null;
  latest_release_number: number;
  conflicts: Array<{
    id: string;
    groupId: string;
    nodeKey: string;
    unitKey: string;
    kind: LibrarySyncConflict["kind"];
    detail: { message?: string; reason?: "REFERENCED_PDF" } | null;
    createdAt: string;
    releaseNumber: number;
  }>;
};

const HTML_UNITS = new Set([
  "explanation.body",
  "explanation.sideBody",
  "exercise.description",
  "manual.description",
]);
const CODE_PREFIXES = [
  "exercise.starterCode",
  "exercise.solution:",
  "manual.file:",
  "manual.solutionFile:",
];
const TEXT_UNITS = new Set([
  "course.title",
  "course.description",
  "module.title",
  "module.description",
  "lecture.title",
  "lecture.description",
  "material.title",
  "exercise.inputFormat",
  "exercise.outputFormat",
  "exercise.constraints",
  "manual.hint",
  "manual.modelAnswer",
  "sa.prompt",
]);
const STRUCTURAL = new Set(["@presence", "@parent", "@order"]);

function unitValueKind(unitKey: string): "text" | "html" | "code" | "json" {
  if (HTML_UNITS.has(unitKey) || unitKey.startsWith("mc.option:"))
    return "html";
  if (
    CODE_PREFIXES.some(
      (prefix) => unitKey === prefix || unitKey.startsWith(prefix),
    )
  )
    return "code";
  if (TEXT_UNITS.has(unitKey)) return "text";
  return "json";
}

/** Whether Merge manually is offered: one text, HTML or code unit. */
const manualMergeable = (unitKey: string) => unitValueKind(unitKey) !== "json";

/**
 * A unit whose value is an object with one text a person edits: Merge
 * manually edits that member and keeps the others, and the comparison shows
 * it with the caption member above it.
 */
function textMemberOf(
  unitKey: string,
): { text: string; caption: string } | null {
  return unitKey.startsWith("exercise.solution:")
    ? { text: "code", caption: "title" }
    : null;
}

type Members = { [key: string]: CanonicalValue };
/** An object value with named members: neither a list nor a big text. */
const membersOf = (value: CanonicalValue | undefined): Members | null =>
  value !== null &&
  value !== undefined &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  !isBig(value)
    ? (value as Members)
    : null;

const plain = (node: CanonicalValue): unknown => {
  if (node === null || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(plain);
  if (isBig(node)) return "$t" in node ? node.$t : null;
  return Object.fromEntries(
    Object.entries(node).map(([key, child]) => [key, plain(child)]),
  );
};

function displayValue(
  unitKey: string,
  value: CanonicalValue | undefined,
  state: "VALUE" | "ABSENT" | "UNKNOWN" = "VALUE",
): SyncValue {
  if (state === "UNKNOWN") return { kind: "unknown", value: null };
  if (state === "ABSENT" || value === undefined)
    return { kind: "absent", value: null };
  const kind = unitValueKind(unitKey);
  const member = textMemberOf(unitKey);
  const members = membersOf(value);
  if (member && members) {
    const text = plain(members[member.text] ?? null);
    const caption = plain(members[member.caption] ?? null);
    return {
      kind,
      value: typeof text === "string" ? text : "",
      caption: typeof caption === "string" ? caption : null,
    };
  }
  const shown = plain(value);
  return {
    kind: kind !== "json" && typeof shown !== "string" ? "json" : kind,
    value: shown,
  };
}

/**
 * A unit's value with its text replaced by an editor's merged text, in the
 * shape `shape` has: a big text stays big, and a solution keeps its title.
 */
function withMergedText(
  unitKey: string,
  shape: CanonicalValue | undefined,
  text: string,
): CanonicalValue {
  const asShaped = (like: CanonicalValue | undefined): CanonicalValue =>
    isBig(like) ? big(text) : text;
  const member = textMemberOf(unitKey);
  const members = membersOf(shape);
  if (member && members)
    return { ...members, [member.text]: asShaped(members[member.text]) };
  return asShaped(shape);
}

function actionsFor(
  kind: string,
  unitKey: string,
  reason?: string | null,
): LibrarySyncResolution[] {
  if (reason === "REFERENCED_PDF") return ["ACCEPT_LIBRARY", "KEEP_ACADEMY"];
  if (
    kind === "INVALID_RESULT" ||
    kind === "PARENT_MISSING" ||
    kind === "REMOVED_UPSTREAM_HAS_LOCAL_CONTENT"
  )
    return ["KEEP_ACADEMY"];
  if (kind === "PLACEMENT") return ["ACCEPT_LIBRARY", "KEEP_ACADEMY"];
  const actions: LibrarySyncResolution[] = ["ACCEPT_LIBRARY", "KEEP_ACADEMY"];
  if (
    manualMergeable(unitKey) &&
    !STRUCTURAL.has(unitKey) &&
    kind !== "REMOVED_UPSTREAM_EDITED_LOCALLY" &&
    kind !== "EDITED_UPSTREAM_DELETED_LOCALLY"
  )
    actions.push("MANUAL");
  return actions;
}

@Injectable()
export class AcademyLibrarySyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AcademyAccessService,
    private readonly audit: AuditService,
    private readonly revocation: MonitoringRevocationService,
    @Optional() private readonly notifications?: NotificationBroadcaster,
    @Optional() private readonly previews?: LibraryReviewPreviews,
  ) {}

  /**
   * Everything the Library updates page shows: one access check, then two
   * reads started together (three statements including access). Each read
   * is scoped to this academy's copy on its own, so none waits on another.
   */
  async updates(
    identity: SupabaseIdentity,
    input: { academyId: string; courseId: string; nodeKey?: string },
  ): Promise<AcademyLibrarySyncUpdates> {
    await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "curriculum.manage",
    );
    const [states, paths] = await Promise.all([
      this.prisma.$queryRaw<Array<UpdatesStateRow>>`
        SELECT s.library_course_id, lc.title AS library_title, lc.retired_at, s.applied_release_number, s.target_release_number,
          (SELECT count(*)::int FROM library_sync_links k JOIN library_release_nodes n ON n.node_key=k.node_key AND n.release_id=s.target_release_id WHERE k.copy_course_id=s.course_id AND k.meta->>'legacyUnmatched'='true') AS unmatched_count,
          s.status::text AS status, s.open_conflict_count, s.divergent_unit_count, s.last_run_at,
          coalesce((SELECT max(r.number) FROM library_releases r WHERE r.library_course_id = s.library_course_id), 0) AS latest_release_number,
          coalesce((
            SELECT jsonb_agg(jsonb_build_object(
              'id', x.id, 'groupId', x.group_id, 'nodeKey', x.node_key, 'unitKey', x.unit_key, 'kind', x.kind,
              'detail', x.detail, 'createdAt', x.created_at, 'releaseNumber', r.number) ORDER BY x.created_at, x.id)
            FROM library_sync_conflicts x JOIN library_releases r ON r.id = x.theirs_release_id
            WHERE x.copy_course_id = s.course_id AND x.status = 'OPEN'), '[]'::jsonb) AS conflicts
        FROM course_sync_states s
        JOIN courses c ON c.id = s.course_id AND c.academy_id = ${input.academyId}::uuid
        JOIN courses lc ON lc.id = s.library_course_id
        WHERE s.course_id = ${input.courseId}::uuid`,
      this.paths(input.academyId, input.courseId),
    ]);
    const state = states[0];
    if (!state) return { sync: null, conflicts: [], runs: [] };

    const sync: AcademyCourseSync = {
      unmatchedCount: state.unmatched_count,
      libraryCourseId: state.library_course_id,
      libraryTitle: state.library_title,
      appliedReleaseNumber: state.applied_release_number,
      targetReleaseNumber: state.target_release_number,
      latestReleaseNumber: state.latest_release_number,
      status: state.status as AcademyCourseSync["status"],
      chip: linkedSyncChip({
        status: state.status as AcademyCourseSync["status"],
        openConflictCount: state.open_conflict_count,
        appliedReleaseNumber: state.applied_release_number,
        targetReleaseNumber: state.target_release_number,
        sourceRetiredAt: state.retired_at,
      }),
      openConflictCount: state.open_conflict_count,
      divergentUnitCount: state.divergent_unit_count,
      lastRunAt: state.last_run_at?.toISOString() ?? null,
    };
    const conflicts: LibrarySyncConflict[] = state.conflicts.map((row) => ({
      id: row.id,
      groupId: row.groupId,
      nodeKey: row.nodeKey,
      unitKey: row.unitKey,
      kind: row.kind,
      path: paths.get(row.nodeKey)?.path ?? [],
      materialType: paths.get(row.nodeKey)?.materialType ?? null,
      releaseNumber: row.releaseNumber,
      message: (row.detail ?? {}).message ?? null,
      reason: (row.detail ?? {}).reason ?? null,
      createdAt: new Date(row.createdAt).toISOString(),
      actions: actionsFor(
        row.kind,
        row.unitKey,
        (row.detail as { reason?: string } | null)?.reason,
      ),
    }));

    const selected = input.nodeKey ? conflicts.find(item => item.nodeKey === input.nodeKey) : undefined;
    return {
      sync, conflicts, runs: [],
      ...(input.nodeKey ? { detail: selected ? await this.readConflict({ academyId: input.academyId, conflictId: selected.id }, paths) : null } : {}),
    };
  }

  async conflict(
    identity: SupabaseIdentity,
    input: { academyId: string; conflictId: string },
  ): Promise<LibrarySyncConflictDetail> {
    await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "curriculum.manage",
    );
    return this.readConflict(input);
  }

  /** The combined material read reuses its resolved access and outline paths. */
  private async readConflict(
    input: { academyId: string; conflictId: string },
    knownPaths?: Map<string, { path: string[]; materialType: string | null }>,
  ): Promise<LibrarySyncConflictDetail> {
    const row = await this.prisma.librarySyncConflict.findFirst({
      where: {
        id: input.conflictId,
        copyCourse: { academyId: input.academyId },
      },
      include: { theirsRelease: { select: { number: true } } },
    });
    if (!row)
      throw new AppException("LIBRARY_COURSE_NOT_FOUND", HttpStatus.NOT_FOUND);
    const [paths, members, allLive, structuralLive] = await Promise.all([
      knownPaths ?? this.paths(input.academyId, row.copyCourseId),
      this.prisma.librarySyncConflict.findMany({
        where: { groupId: row.groupId, status: "OPEN" },
      }),
      !STRUCTURAL.has(row.unitKey)
        ? this.liveUnits(this.prisma, row.copyCourseId, row.nodeKey)
        : Promise.resolve(null),
      STRUCTURAL.has(row.unitKey)
        ? this.liveUnit(this.prisma, row.copyCourseId, row.nodeKey, row.unitKey)
        : Promise.resolve(null),
    ]);
    const live = structuralLive ?? {
      value: allLive?.values[row.unitKey],
      hash: allLive?.hashes[row.unitKey] ?? null,
    };
    const hasChoices = [row, ...members].some(
      (member) => member.unitKey === "mc.structure",
    );
    const choiceNode = hasChoices
      ? await this.prisma.libraryReleaseNode.findUnique({
          where: {
            releaseId_nodeKey: {
              releaseId: row.theirsReleaseId,
              nodeKey: row.nodeKey,
            },
          },
          select: { unitHashes: true },
        })
      : null;
    const optionHashes = Object.entries(
      (choiceNode?.unitHashes ?? {}) as Record<string, string>,
    ).filter(([key]) => key.startsWith("mc.option:"));
    const stored = await readValues(this.prisma, [
      ...[row, ...members]
        .flatMap((m) => [m.baseHash, m.theirsHash])
        .filter((hash): hash is string => !!hash),
      ...optionHashes.map(([, hash]) => hash),
    ]);
    const incomingOptions = Object.fromEntries(
      optionHashes.map(([key, hash]) => [key, stored.get(hash)]),
    );
    const assets = await this.comparisonAssets(
      [row, ...members]
        .filter(
          (member) =>
            member.unitKey === "pdf.file" || member.unitKey === "video.media",
        )
        .flatMap((member) => [
          member.baseHash ? stored.get(member.baseHash) : undefined,
          member.theirsHash ? stored.get(member.theirsHash) : undefined,
          allLive?.values[member.unitKey],
        ]),
    );
    const shown = (
      unit: string,
      value: CanonicalValue | undefined,
      state: "VALUE" | "ABSENT" | "UNKNOWN" = "VALUE",
      options: Record<string, CanonicalValue | undefined> = {},
    ) => {
      const result = displayValue(unit, value, state);
      if (
        result.kind !== "json" ||
        !result.value ||
        typeof result.value !== "object" ||
        Array.isArray(result.value)
      )
        return result;
      const object = result.value as Record<string, unknown>;
      if (unit === "mc.structure" && Array.isArray(object.options))
        result.value = {
          ...object,
          options: object.options.map((key) => ({
            key,
            content:
              typeof key === "string"
                ? plain(options[`mc.option:${key}`] ?? null)
                : null,
            correct:
              Array.isArray(object.correct) && object.correct.includes(key),
          })),
        };
      if (
        (unit === "pdf.file" || unit === "video.media") &&
        typeof object.assetId === "string"
      )
        result.value = { ...object, ...assets.get(object.assetId) };
      return result;
    };
    const structure = STRUCTURAL.has(row.unitKey)
      ? await this.structuralVersions(
          row.copyCourseId,
          row.theirsReleaseId,
          row.nodeKey,
          row.unitKey,
          paths,
          structuralLive?.nodes ?? [],
        )
      : null;
    const imageUrls = await this.previews?.images([
      ...stored.values(), ...Object.values(allLive?.values ?? {}),
    ]).catch(() => ({}));
    return {
      imageUrls,
      id: row.id,
      groupId: row.groupId,
      nodeKey: row.nodeKey,
      unitKey: row.unitKey,
      kind: row.kind,
      path: paths.get(row.nodeKey)?.path ?? [],
      materialType: paths.get(row.nodeKey)?.materialType ?? null,
      releaseNumber: row.theirsRelease.number,
      message: ((row.detail ?? {}) as { message?: string }).message ?? null,
      reason:
        ((row.detail ?? {}) as { reason?: "REFERENCED_PDF" }).reason ?? null,
      dependents: ((row.detail as { reason?: string } | null)?.reason ===
      "REFERENCED_PDF"
        ? await this.referenceDependents(
            this.prisma,
            row.copyCourseId,
            row.nodeKey,
          )
        : []
      ).map((id) => paths.get(`local:${id}`)?.path ?? []),
      createdAt: row.createdAt.toISOString(),
      actions: actionsFor(
        row.kind,
        row.unitKey,
        (row.detail as { reason?: string } | null)?.reason,
      ).filter((action) => action !== "MANUAL" || members.length <= 1),
      base: structure
        ? structure.base
        : shown(
            row.unitKey,
            row.baseHash ? stored.get(row.baseHash) : undefined,
            row.baseState,
          ),
      ours: structure
        ? structure.ours
        : shown(
            row.unitKey,
            live.value,
            live.value === undefined ? "ABSENT" : "VALUE",
            allLive?.values,
          ),
      theirs: structure
        ? structure.theirs
        : shown(
            row.unitKey,
            row.theirsHash ? stored.get(row.theirsHash) : undefined,
            row.theirsHash ? "VALUE" : "ABSENT",
            incomingOptions,
          ),
      expectedOursHash: live.hash,
      expectedTheirsHash: row.theirsHash,
      members: members
        .filter((member) => member.unitKey !== row.unitKey)
        .map((member) => ({
          unitKey: member.unitKey,
          base: shown(
            member.unitKey,
            member.baseHash ? stored.get(member.baseHash) : undefined,
            member.baseState,
          ),
          ours: shown(
            member.unitKey,
            allLive?.values[member.unitKey],
            "VALUE",
            allLive?.values,
          ),
          theirs: shown(
            member.unitKey,
            member.theirsHash ? stored.get(member.theirsHash) : undefined,
            member.theirsHash ? "VALUE" : "ABSENT",
            incomingOptions,
          ),
        })),
    };
  }

  /** Safe immutable metadata for assets already present in the authorized comparison. */
  private async comparisonAssets(values: Array<CanonicalValue | undefined>) {
    const ids = [
      ...new Set(
        values
          .map((value) => membersOf(value)?.assetId)
          .filter((id): id is string => typeof id === "string"),
      ),
    ];
    if (!ids.length)
      return new Map<
        string,
        {
          filename: string;
          bytes: string;
          pages: number | null;
          durationMs: number | null;
        }
      >();
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        filename: string;
        bytes: string;
        pages: number | null;
        durationMs: number | null;
        kind: string;
        objectKey: string;
      }>
    >`
      SELECT id,original_filename AS filename,byte_size::text AS bytes,page_count AS pages,NULL::int AS "durationMs",'PDF' AS kind,object_key AS "objectKey" FROM pdf_assets WHERE id=ANY(${ids}::uuid[]) AND state='READY'
      UNION ALL SELECT id,filename,byte_size::text,NULL::int,duration_ms,'VIDEO',academy_id::text || '/' || id::text || '/' || (SELECT path FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(outputs)='array' THEN outputs ELSE '[]'::jsonb END) AS path WHERE path='playback.mp4' OR path LIKE '%/playback.mp4' LIMIT 1) FROM video_assets WHERE id=ANY(${ids}::uuid[]) AND state='READY'`;
    const urls=await this.previews?.media(rows,values).catch(() => null);
    return new Map(rows.map(({ id, kind: _kind, objectKey: _key, ...metadata }) => [id, { ...metadata, ...urls?.get(id) }]));
  }

  async resolve(
    identity: SupabaseIdentity,
    input: ResolveLibrarySyncConflictInput,
  ): Promise<{ sync: AcademyCourseSync | null }> {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "curriculum.manage",
    );
    const found = await this.prisma.librarySyncConflict.findFirst({
      where: {
        id: input.conflictId,
        copyCourse: { academyId: input.academyId },
      },
      select: { copyCourseId: true },
    });
    if (!found)
      throw new AppException("LIBRARY_COURSE_NOT_FOUND", HttpStatus.NOT_FOUND);
    const copyCourseId = found.copyCourseId;
    const requestHash = sha256Hex(
      canonicalJson({
        conflictId: input.conflictId,
        action: input.action,
        value: input.value ?? null,
        ours: input.expectedOursHash,
        theirs: input.expectedTheirsHash,
      }),
    );

    let archived = false;
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM courses WHERE id = ${copyCourseId}::uuid FOR UPDATE`;
        const receipt = await tx.librarySyncResolutionReceipt.findUnique({
          where: {
            copyCourseId_requestKey: {
              copyCourseId,
              requestKey: input.requestKey,
            },
          },
        });
        if (receipt) {
          if (receipt.requestHash !== requestHash)
            throw new AppException(
              "CONTENT_EDIT_CONFLICT",
              HttpStatus.CONFLICT,
            );
          return;
        }
        const conflict = await tx.librarySyncConflict.findUnique({
          where: { id: input.conflictId },
        });
        const state = await tx.courseSyncState.findUnique({
          where: { courseId: copyCourseId },
        });
        if (!conflict || conflict.status !== "OPEN" || !state)
          throw new AppException("CONTENT_EDIT_CONFLICT", HttpStatus.CONFLICT);
        // Decide against the release the conflict was raised for, with nothing newer in flight.
        if (
          conflict.theirsReleaseId !== state.baseReleaseId ||
          state.targetReleaseNumber > state.appliedReleaseNumber
        )
          throw new AppException("CONTENT_EDIT_CONFLICT", HttpStatus.CONFLICT);
        const reason = (conflict.detail as { reason?: string } | null)?.reason;
        if (
          input.action === "ACCEPT_LIBRARY" &&
          reason === "REFERENCED_PDF" &&
          (await this.referenceDependents(tx, copyCourseId, conflict.nodeKey))
            .length
        )
          throw new AppException(
            "CONTENT_VALIDATION_FAILED",
            HttpStatus.CONFLICT,
            "Change the referencing exercises before accepting this removal.",
          );
        if (
          !actionsFor(conflict.kind, conflict.unitKey, reason).includes(
            input.action,
          )
        )
          throw new AppException(
            "CONTENT_VALIDATION_FAILED",
            HttpStatus.BAD_REQUEST,
            "That decision is not available here.",
          );
        const group = await tx.librarySyncConflict.findMany({
          where: { groupId: conflict.groupId, status: "OPEN" },
        });
        if (input.action === "MANUAL" && group.length > 1)
          throw new AppException(
            "CONTENT_VALIDATION_FAILED",
            HttpStatus.BAD_REQUEST,
            "Review this complete definition together.",
          );
        const live = await this.liveUnits(tx, copyCourseId, conflict.nodeKey);
        // Every member must still be what the editor compared (design §13.2).
        if (conflict.theirsHash !== input.expectedTheirsHash)
          throw new AppException("CONTENT_EDIT_CONFLICT", HttpStatus.CONFLICT);
        if (STRUCTURAL.has(conflict.unitKey)) {
          if (
            (
              await this.liveUnit(
                tx,
                copyCourseId,
                conflict.nodeKey,
                conflict.unitKey,
              )
            ).hash !== input.expectedOursHash
          )
            throw new AppException(
              "CONTENT_EDIT_CONFLICT",
              HttpStatus.CONFLICT,
            );
        } else {
          const current = live.hashes[conflict.unitKey] ?? null;
          if (current !== input.expectedOursHash)
            throw new AppException(
              "CONTENT_EDIT_CONFLICT",
              HttpStatus.CONFLICT,
            );
          for (const member of group)
            if (
              member.id !== conflict.id &&
              (live.hashes[member.unitKey] ?? null) !== member.oursHash
            )
              throw new AppException(
                "CONTENT_EDIT_CONFLICT",
                HttpStatus.CONFLICT,
              );
        }

        let resolvedHash: string | null = null;
        const members = group.map((member) => member.unitKey);
        const deleteBases = (nodeKey: string, unitKeys: string[] | null) =>
          tx.librarySyncBase.deleteMany({
            where: {
              copyCourseId,
              nodeKey,
              ...(unitKeys ? { unitKey: { in: unitKeys } } : {}),
            },
          });

        if (input.action === "KEEP_ACADEMY") {
          if (conflict.unitKey === "@presence") {
            if (
              conflict.kind === "REMOVED_UPSTREAM_EDITED_LOCALLY" ||
              conflict.kind === "REMOVED_UPSTREAM_HAS_LOCAL_CONTENT"
            ) {
              // Academy-owned from now on; later releases leave it alone.
              await tx.librarySyncLink.update({
                where: {
                  copyCourseId_nodeKey: {
                    copyCourseId,
                    nodeKey: conflict.nodeKey,
                  },
                },
                data: { state: "DETACHED" },
              });
              await deleteBases(conflict.nodeKey, null);
            } else if (conflict.kind === "EDITED_UPSTREAM_DELETED_LOCALLY") {
              await deleteBases(conflict.nodeKey, null);
            } else {
              // Decline an addition the copy cannot take: a tombstone keeps it out.
              await tx.librarySyncLink.upsert({
                where: {
                  copyCourseId_nodeKey: {
                    copyCourseId,
                    nodeKey: conflict.nodeKey,
                  },
                },
                create: {
                  copyCourseId,
                  nodeKey: conflict.nodeKey,
                  kind: "MATERIAL",
                  localId: null,
                  state: "LOCAL_DELETED",
                  evidence: "MANUAL",
                },
                update: { state: "LOCAL_DELETED", localId: null },
              });
            }
          } else if (STRUCTURAL.has(conflict.unitKey)) {
            await deleteBases(conflict.nodeKey, [conflict.unitKey]);
          } else if (!STRUCTURAL.has(conflict.unitKey)) {
            // Base becomes theirs: the library change is acknowledged and will
            // not be raised again; a later change to it will be.
            await deleteBases(conflict.nodeKey, members);
          }
        } else if (input.action === "ACCEPT_LIBRARY") {
          if (conflict.unitKey === "@parent" || conflict.unitKey === "@order") {
            const projection = (await readCourseProjection(tx, copyCourseId, {
              mode: "digest",
            }))!;
            const nodes = projectNodes(
              projection,
              copyKeyMap(projection, state.libraryCourseId),
            );
            const value =
              conflict.unitKey === "@parent"
                ? (nodes.find((n) => n.key === conflict.nodeKey)?.parentKey ??
                  null)
                : nodes
                    .filter((n) => n.parentKey === conflict.nodeKey)
                    .sort((a, b) => a.ordinal - b.ordinal)
                    .map((n) => n.key);
            const hash = unitHash(conflict.unitKey, value);
            await storeValues(tx, [{ hash, value }]);
            await this.pinBases(
              tx,
              copyCourseId,
              conflict.nodeKey,
              [[conflict.unitKey, hash]],
              false,
            );
          } else if (
            conflict.unitKey === "@presence" &&
            conflict.kind === "EDITED_UPSTREAM_DELETED_LOCALLY"
          ) {
            await tx.librarySyncLink.deleteMany({
              where: { copyCourseId, nodeKey: conflict.nodeKey, localId: null },
            });
            await deleteBases(conflict.nodeKey, null);
          } else if (conflict.unitKey === "@presence") {
            // Accept a removal: pin base to the copy as it is, so the next run
            // reads the node as untouched and archives it.
            await this.pinBases(
              tx,
              copyCourseId,
              conflict.nodeKey,
              Object.keys(live.hashes).map((unitKey) => [
                unitKey,
                live.hashes[unitKey]!,
              ]),
              true,
            );
          } else {
            await this.pinBases(
              tx,
              copyCourseId,
              conflict.nodeKey,
              members.map((unitKey) => [unitKey, live.hashes[unitKey] ?? null]),
              false,
            );
          }
          resolvedHash = conflict.theirsHash;
        } else {
          if (input.value === undefined || !manualMergeable(conflict.unitKey))
            throw new AppException(
              "CONTENT_VALIDATION_FAILED",
              HttpStatus.BAD_REQUEST,
              "Merge manually needs text.",
            );
          const stored = await readValues(
            tx,
            [conflict.baseHash, conflict.theirsHash].filter(
              (hash): hash is string => !!hash,
            ),
          );
          const theirs = conflict.theirsHash
            ? stored.get(conflict.theirsHash)
            : undefined;
          resolvedHash = await this.writeManual(tx, {
            academyId: input.academyId,
            copyCourseId,
            libraryCourseId: state.libraryCourseId,
            nodeKey: conflict.nodeKey,
            unitKey: conflict.unitKey,
            text: input.value,
            shape: live.values[conflict.unitKey] ?? theirs,
            allowedFrom: [live.values[conflict.unitKey], ...stored.values()],
          });
          await deleteBases(conflict.nodeKey, members);
        }

        await tx.librarySyncConflict.updateMany({
          where: { id: { in: group.map((member) => member.id) } },
          data: {
            status: "RESOLVED",
            resolution: input.action,
            resolvedHash,
            resolvedByUserId: actor.userId,
            resolvedAt: new Date(),
          },
        });
        if (input.action === "ACCEPT_LIBRARY") {
          const result = await runCopySync(tx, this.audit, {
            copyCourseId,
            fence: null,
            resolution: true,
          });
          archived =
            result.status === "APPLIED" && result.archivedLocalIds.length > 0;
          if (
            await tx.librarySyncConflict.count({
              where: {
                copyCourseId,
                nodeKey: conflict.nodeKey,
                unitKey: conflict.unitKey,
                status: "OPEN",
              },
            })
          )
            throw new AppException(
              "CONTENT_VALIDATION_FAILED",
              HttpStatus.CONFLICT,
              "This change still violates a content dependency.",
            );
        }
        const open = await tx.librarySyncConflict.count({
          where: { copyCourseId, status: "OPEN" },
        });
        await tx.courseSyncState.update({
          where: { courseId: copyCourseId },
          data: { openConflictCount: open },
        });
        await refreshReviewItems(tx, copyCourseId);
        await tx.librarySyncChange.createMany({
          data: group.map((member) => ({
            copyCourseId,
            releaseId: conflict.theirsReleaseId,
            nodeKey: member.nodeKey,
            unitKey: member.unitKey,
            outcome: "RESOLVED" as const,
          })),
        });
        await tx.librarySyncResolutionReceipt.create({
          data: {
            copyCourseId,
            requestKey: input.requestKey,
            actorUserId: actor.userId,
            requestHash,
            groupId: conflict.groupId,
            result: { action: input.action },
          },
        });
        await this.audit.write(tx, {
          actorUserId: actor.userId,
          academyId: input.academyId,
          action: "content.library_sync.conflict_resolved",
          targetType: "Course",
          targetId: copyCourseId,
          after: {
            action: input.action,
            nodeKey: conflict.nodeKey,
            units: members,
            theirsHash: conflict.theirsHash,
            resolvedHash,
          },
        });
      },
      { maxWait: 5_000, timeout: 60_000 },
    );
    await this.notifications?.courseReviewChanged(copyCourseId);
    if (archived) {
      const assignments = await this.prisma.classCourse.findMany({
        where: { courseId: copyCourseId },
        select: { classId: true },
      });
      await Promise.all(
        assignments.map(({ classId }) =>
          this.revocation.revokeClass(classId, "MATERIAL_UNAVAILABLE"),
        ),
      );
    }
    return {
      sync: await this.readStatus(this.prisma, input.academyId, copyCourseId),
    };
  }

  // ------------------------------------------------------------------ helpers

  private async readStatus(
    db: Pick<PrismaService, "courseSyncState" | "libraryRelease">,
    academyId: string,
    courseId: string,
  ): Promise<AcademyCourseSync | null> {
    const state = await db.courseSyncState.findFirst({
      where: { courseId, course: { academyId } },
      include: {
        libraryCourse: {
          select: {
            title: true,
            retiredAt: true,
            releases: {
              orderBy: { number: "desc" },
              take: 1,
              select: { number: true },
            },
          },
        },
      },
    });
    if (!state) return null;
    return {
      libraryCourseId: state.libraryCourseId,
      libraryTitle: state.libraryCourse.title,
      appliedReleaseNumber: state.appliedReleaseNumber,
      targetReleaseNumber: state.targetReleaseNumber,
      latestReleaseNumber: state.libraryCourse.releases[0]?.number ?? 0,
      status: state.status,
      chip: linkedSyncChip({
        ...state,
        sourceRetiredAt: state.libraryCourse.retiredAt,
      }),
      openConflictCount: state.openConflictCount,
      divergentUnitCount: state.divergentUnitCount,
      lastRunAt: state.lastRunAt?.toISOString() ?? null,
    };
  }

  /** "Module › Lecture › Material" for every node of this academy's copy, from its own titles. */
  private async paths(academyId: string, copyCourseId: string) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        node_key: string | null;
        local_id: string;
        kind: string;
        title: string;
        parent: string | null;
        material_type: string | null;
      }>
    >`
      SELECT k.node_key, x.id AS local_id, x.kind, x.title, x.parent, x.material_type FROM (
        SELECT cm.id, 'MODULE' AS kind, cm.title, NULL::uuid AS parent, NULL::text AS material_type FROM course_modules cm WHERE cm.course_id = ${copyCourseId}::uuid
        UNION ALL SELECT l.id, 'LECTURE', l.title, l.course_module_id, NULL FROM lectures l JOIN course_modules cm ON cm.id = l.course_module_id WHERE cm.course_id = ${copyCourseId}::uuid
        UNION ALL SELECT mt.id, 'MATERIAL', mt.title, mt.lecture_id, mt.type::text FROM materials mt JOIN lectures l ON l.id = mt.lecture_id JOIN course_modules cm ON cm.id = l.course_module_id WHERE cm.course_id = ${copyCourseId}::uuid
      ) x LEFT JOIN library_sync_links k ON k.copy_course_id = ${copyCourseId}::uuid AND k.local_id = x.id
      WHERE EXISTS (SELECT 1 FROM courses c WHERE c.id = ${copyCourseId}::uuid AND c.academy_id = ${academyId}::uuid)`;
    const byLocal = new Map(rows.map((row) => [row.local_id, row]));
    const out = new Map<
      string,
      { path: string[]; materialType: string | null }
    >();
    for (const row of rows) {
      const path: string[] = [];
      for (
        let cursor: typeof row | undefined = row;
        cursor;
        cursor = cursor.parent ? byLocal.get(cursor.parent) : undefined
      )
        path.unshift(cursor.title);
      const entry = { path, materialType: row.material_type };
      out.set(row.node_key ?? `local:${row.local_id}`, entry);
      out.set(`local:${row.local_id}`, entry);
    }
    return out;
  }

  /** The copy's current units of one node, full values and hashes. */
  private async liveUnits(
    db: Tx | PrismaService,
    copyCourseId: string,
    nodeKey: string,
  ) {
    const state = await db.courseSyncState.findUniqueOrThrow({
      where: { courseId: copyCourseId },
      select: { libraryCourseId: true },
    });
    const link = nodeKey.startsWith("local:")
      ? { localId: nodeKey.slice(6), kind: "MATERIAL" }
      : await db.librarySyncLink.findUnique({
          where: { copyCourseId_nodeKey: { copyCourseId, nodeKey } },
          select: { localId: true, kind: true },
        });
    const materialIds =
      link?.kind === "MATERIAL" && link.localId ? [link.localId] : [];
    const projection = await readCourseProjection(db, copyCourseId, {
      mode: "full",
      materialIds,
    });
    const node = projection
      ? projectNodes(
          projection,
          copyKeyMap(projection, state.libraryCourseId),
        ).find((candidate) => candidate.key === nodeKey)
      : undefined;
    const values = node?.units ?? {};
    const hashes: Record<string, string> = {};
    for (const [unitKey, value] of Object.entries(values))
      hashes[unitKey] = unitHash(unitKey, value);
    return { values, hashes, node };
  }

  private async liveUnit(
    db: Tx | PrismaService,
    copyCourseId: string,
    nodeKey: string,
    unitKey: string,
  ) {
    if (STRUCTURAL.has(unitKey)) {
      const state = await db.courseSyncState.findUniqueOrThrow({
        where: { courseId: copyCourseId },
        select: { libraryCourseId: true },
      });
      const projection = (await readCourseProjection(db, copyCourseId, {
        mode: "digest",
      }))!;
      const nodes = projectNodes(
        projection,
        copyKeyMap(projection, state.libraryCourseId),
      );
      return {
        value: undefined,
        nodes,
        hash: sha256Hex(
          canonicalJson({
            nodeKey,
            unitKey,
            nodes: nodes.map((n) => ({
              key: n.key,
              parent: n.parentKey,
              ordinal: n.ordinal,
              visible: n.isVisible,
              hashes: Object.fromEntries(
                Object.entries(n.units).map(([k, v]) => [k, unitHash(k, v)]),
              ),
            })),
          }),
        ),
      };
    }
    const live = await this.liveUnits(db, copyCourseId, nodeKey);
    return {
      value: live.values[unitKey] as CanonicalValue | undefined,
      hash: live.hashes[unitKey] ?? null,
    };
  }

  /** Names and placement only; no material bodies are needed for a structural decision. */
  private async structuralVersions(
    copyCourseId: string,
    releaseId: string,
    nodeKey: string,
    unitKey: string,
    paths: Map<string, { path: string[]; materialType: string | null }>,
    local: SyncNode[],
  ) {
    const [source, exception] = await Promise.all([
      this.prisma.libraryReleaseNode.findMany({
        where: { releaseId },
        select: {
          nodeKey: true,
          parentKey: true,
          ordinal: true,
          unitHashes: true,
        },
      }),
      this.prisma.librarySyncBase.findUnique({
        where: {
          copyCourseId_nodeKey_unitKey: { copyCourseId, nodeKey, unitKey },
        },
      }),
    ]);
    const hashes = source.flatMap((n) =>
      Object.entries(n.unitHashes as Record<string, string>)
        .filter(([key]) => key.endsWith(".title"))
        .map(([, hash]) => hash),
    );
    if (exception?.baseHash) hashes.push(exception.baseHash);
    const values = await readValues(this.prisma, hashes);
    const labels = new Map(
      source.map((n) => [
        n.nodeKey,
        String(
          values.get(
            Object.entries(n.unitHashes as Record<string, string>).find(
              ([key]) => key.endsWith(".title"),
            )?.[1] ?? "",
          ) ?? n.nodeKey,
        ),
      ]),
    );
    for (const [key, value] of paths) labels.set(key, value.path.join(" › "));
    const label = (key: string) => labels.get(key) ?? key;
    const named = (value: CanonicalValue | undefined): SyncValue =>
      value === undefined
        ? { kind: "absent", value: null }
        : displayValue(
            unitKey,
            Array.isArray(value)
              ? value.map((v) => (typeof v === "string" ? label(v) : v))
              : typeof value === "string"
                ? label(value)
                : value,
          );
    const structure = (
      nodes: Array<{ key: string; parentKey: string | null; ordinal: number }>,
    ) =>
      unitKey === "@presence"
        ? nodes.some((n) => n.key === nodeKey)
          ? label(nodeKey)
          : undefined
        : unitKey === "@parent"
          ? nodes.find((n) => n.key === nodeKey)?.parentKey
          : nodes
              .filter((n) => n.parentKey === nodeKey)
              .sort((a, b) => a.ordinal - b.ordinal)
              .map((n) => n.key);
    return {
      base:
        exception?.baseState === "UNKNOWN"
          ? { kind: "unknown" as const, value: null }
          : unitKey === "@presence" && exception?.baseState === "VALUE"
            ? named(label(nodeKey))
            : exception?.baseHash
              ? named(values.get(exception.baseHash))
              : { kind: "unknown" as const, value: null },
      ours: named(structure(local)),
      theirs: named(structure(source.map((n) => ({ ...n, key: n.nodeKey })))),
    };
  }

  /** Incoming references are checked live under the same course lock on resolution. */
  private async referenceDependents(
    db: Pick<PrismaService, "$queryRaw">,
    copyCourseId: string,
    nodeKey: string,
  ): Promise<string[]> {
    const rows = await db.$queryRaw<Array<{ id: string }>>`
      SELECT e.material_id AS id FROM programming_exercises e
      JOIN materials em ON em.id=e.material_id JOIN lectures el ON el.id=em.lecture_id JOIN course_modules ec ON ec.id=el.course_module_id AND ec.course_id=${copyCourseId}::uuid
      JOIN materials pdf ON pdf.id=e.reference_pdf_material_id JOIN lectures pl ON pl.id=pdf.lecture_id JOIN course_modules pc ON pc.id=pl.course_module_id AND pc.course_id=${copyCourseId}::uuid
      JOIN library_sync_links k ON k.copy_course_id=${copyCourseId}::uuid AND k.node_key=${nodeKey}::uuid
      WHERE (k.kind='MATERIAL' AND k.local_id=pdf.id) OR (k.kind='LECTURE' AND k.local_id=pl.id) OR (k.kind='MODULE' AND k.local_id=pc.id)`;
    return rows.map((r) => r.id);
  }

  /** Pin some units' base to given hashes (null = absent), keeping other exceptions. */
  private async pinBases(
    tx: Tx,
    copyCourseId: string,
    nodeKey: string,
    units: Array<[string, string | null]>,
    presence: boolean,
  ) {
    const rows = units.map(([unitKey, hash]) => ({
      copyCourseId,
      nodeKey,
      unitKey,
      baseState: hash ? ("VALUE" as const) : ("ABSENT" as const),
      baseHash: hash,
    }));
    if (presence)
      rows.push({
        copyCourseId,
        nodeKey,
        unitKey: "@presence",
        baseState: "VALUE",
        baseHash: `presence:${nodeKey}`,
      });
    await tx.librarySyncBase.deleteMany({
      where: {
        copyCourseId,
        nodeKey,
        unitKey: { in: rows.map((row) => row.unitKey) },
      },
    });
    if (rows.length) await tx.librarySyncBase.createMany({ data: rows });
  }

  /**
   * Write an editor's merged text into one unit of the copy, through the same
   * writer a sync uses, under the same validation and reference rules. The
   * text replaces only what the editor compared, in the shape of `shape` (the
   * copy's value, else the library's): a solution keeps its title.
   */
  private async writeManual(
    tx: Tx,
    input: {
      academyId: string;
      copyCourseId: string;
      libraryCourseId: string;
      nodeKey: string;
      unitKey: string;
      text: string;
      shape: CanonicalValue | undefined;
      allowedFrom: Array<CanonicalValue | undefined>;
    },
  ): Promise<string> {
    const html = unitValueKind(input.unitKey) === "html";
    let text = input.text;
    if (input.unitKey.startsWith("explanation."))
      text = sanitizeExplanation(text);
    else if (html && input.unitKey.startsWith("mc."))
      text = sanitizeChoiceHtml(text);
    await assertMergedImages(
      tx,
      input.academyId,
      input.copyCourseId,
      text,
      input.allowedFrom,
    );

    const live = await this.liveUnits(tx, input.copyCourseId, input.nodeKey);
    if (!live.node)
      throw new AppException("CONTENT_EDIT_CONFLICT", HttpStatus.CONFLICT);
    const value = withMergedText(input.unitKey, input.shape, text);
    const hash = unitHash(input.unitKey, value);
    await storeValues(tx, [{ hash, value }]);

    const projection = (await readCourseProjection(tx, input.copyCourseId, {
      mode: "digest",
    }))!;
    const keys = copyKeyMap(projection, input.libraryCourseId);
    const ours = new Map(
      projectNodes(projection, keys).map((node) => [
        node.key,
        oursView(node, "LINKED"),
      ]),
    );
    const oursFull = new Map<string, SyncNode>([[input.nodeKey, live.node]]);
    const plan: Plan = {
      units: [
        {
          nodeKey: input.nodeKey,
          unitKey: input.unitKey,
          outcome: "APPLIED",
          base: { state: "ABSENT" },
          oursHash: live.hashes[input.unitKey] ?? null,
          theirsHash: hash,
        },
      ],
      adds: [],
      archives: [],
      restores: [],
      closes: [],
      parents: new Map(),
      orders: new Map(),
      itemOrders: new Map(),
      nodeConflicts: [],
      exceptions: [],
    };
    const values = new Map<string, CanonicalValue>([[hash, value]]);
    if (live.node.kind === "MATERIAL" && live.node.materialType) {
      const merged = mergedUnitsFor(
        { theirs: new Map(), oursFull, values, plan },
        input.nodeKey,
        new Map([[input.nodeKey, plan.units]]),
        false,
      );
      const message = validateMaterial(
        live.node.materialType,
        merged,
        { pdfAvailable: () => true },
        live.node.units,
      );
      if (message)
        throw new AppException(
          "CONTENT_VALIDATION_FAILED",
          HttpStatus.BAD_REQUEST,
          message,
        );
    }
    const linked = new Map<string, string>();
    for (const link of projection.links)
      if (link.localId) linked.set(link.nodeKey, link.localId);
    await applyPlan(tx, {
      copyCourseId: input.copyCourseId,
      courseKey: input.libraryCourseId,
      plan,
      theirs: new Map(),
      ours,
      oursFull,
      values,
      linked,
      optionMaps: new Map(
        projection.links
          .filter((link) => link.meta?.optionMap)
          .map((link) => [link.nodeKey, link.meta!.optionMap!]),
      ),
      existingKeys: {
        modules: new Set(),
        lectures: new Set(),
        exercises: new Set(),
      },
      visibility: "SYNC_ADDITION",
    });
    await tx.course.update({
      where: { id: input.copyCourseId },
      data: { contentRevision: { increment: 1 } },
    });
    return hash;
  }
}

const LESSON_IMAGE = /src="cove-asset:([0-9a-f-]{36})"/gi;

/**
 * A merged text may show only images one of the compared versions already
 * showed, or ones this course owns (design §12): showing an image grants it.
 */
async function assertMergedImages(
  tx: Tx,
  academyId: string,
  courseId: string,
  text: string,
  sources: Array<CanonicalValue | undefined>,
) {
  const allowed = new Set<string>();
  const scan = (node: CanonicalValue | undefined) => {
    if (node === null || node === undefined) return;
    if (typeof node === "string")
      for (const match of node.matchAll(LESSON_IMAGE))
        allowed.add(match[1]!.toLowerCase());
    else if (typeof node === "object") {
      if (Array.isArray(node)) node.forEach(scan);
      else if (isBig(node)) scan("$t" in node ? node.$t : null);
      else Object.values(node).forEach(scan);
    }
  };
  sources.forEach(scan);
  const added = [...text.matchAll(LESSON_IMAGE)]
    .map((match) => match[1]!.toLowerCase())
    .filter((id) => !allowed.has(id));
  if (!added.length) return;
  const owned = await tx.manualAsset.count({
    where: {
      id: { in: added },
      academyId,
      courseId,
      mimeType: { startsWith: "image/" },
    },
  });
  if (owned !== new Set(added).size)
    throw new AppException(
      "CONTENT_VALIDATION_FAILED",
      HttpStatus.BAD_REQUEST,
      "An image in the merged text is not available to this course.",
    );
}
