import { randomUUID } from "node:crypto";

import type { AuditService } from "../academies/audit.service.js";
import { Prisma } from "../generated/prisma/client.js";
import { assetRefsOf } from "./asset-retention.js";
import { canonicalJson, unitHash, type CanonicalValue } from "./canonical.js";
import { refreshReviewItems } from "./review-projection.js";
import {
  copyKeyMap,
  isLocalKey,
  isMetaUnit,
  isOrderUnit,
  projectNodes,
  type SyncNode,
} from "./catalog.js";
import type { BaseRef } from "./merge/units.js";
import {
  planMerge,
  type OursNodeView,
  type Plan,
  type ReleaseNodeView,
  type TombstoneState,
} from "./merge/plan.js";
import { oursView, storedReleaseView } from "./nodes.js";
import { readCourseProjection, type ProjectedCourse } from "./projection.js";
import { validateMaterial } from "./validate.js";
import { readValues, storeValues } from "./values.js";
import {
  applyPlan,
  decisionsByNode,
  mergedUnitsFor,
  SyncWriteError,
  type VisibilityPolicy,
} from "./writer.js";

/**
 * One copy brought to its target release, in the caller's transaction
 * (design §14). Recomputed from persisted state every time, so a retry after
 * a rollback redoes the same work and a repeat after success does nothing.
 */

type Tx = Prisma.TransactionClient;

export type RunInput = {
  copyCourseId: string;
  /** The job and lease this run holds; null for adoption, which holds the course. */
  fence: { jobId: string; leaseId: string } | null;
  /** Adoption materializes its own base release into an empty course. */
  adoption?: boolean;
  /**
   * A resolution re-runs the merge for decisions an editor just made: no gate
   * or up-to-date short-circuit, no history or system audit of its own (the
   * resolution writes those).
   */
  resolution?: boolean;
};

export type RunResult =
  | {
      status: "APPLIED";
      summary: Record<string, number>;
      archivedLocalIds: string[];
      academyId: string;
      releaseNumber: number;
      reviewChanged: boolean;
    }
  | { status: "SKIPPED"; reason: "UP_TO_DATE" | "PAUSED" | "GATE_OFF" };

export class StaleLeaseError extends Error {
  constructor() {
    super("The job lease is no longer current");
  }
}

type StateRow = {
  library_course_id: string;
  base_release_id: string | null;
  applied_release_number: number;
  target_release_id: string | null;
  target_release_number: number;
  paused_at: Date | null;
  last_synced_content_revision: number | null;
  open_conflict_count: number;
};

export async function runCopySync(
  tx: Tx,
  audit: AuditService,
  input: RunInput,
): Promise<RunResult> {
  await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
  const course = await tx.$queryRaw<
    Array<{ academy_id: string; content_revision: number; language: string }>
  >`
    SELECT academy_id, content_revision, language::text AS language FROM courses WHERE id = ${input.copyCourseId}::uuid FOR UPDATE`;
  if (!course[0]) throw new SyncWriteError("COPY_NOT_FOUND");
  const academyId = course[0].academy_id;

  if (input.fence) {
    const held = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM library_sync_jobs
      WHERE id = ${input.fence.jobId}::uuid AND lease_id = ${input.fence.leaseId}::uuid
        AND status = 'RUNNING' AND lease_until > now()
      FOR UPDATE`;
    if (!held[0]) throw new StaleLeaseError();
  }

  const [state] = await tx.$queryRaw<Array<StateRow & { gate: boolean }>>`
    SELECT s.library_course_id, s.base_release_id, s.applied_release_number, s.target_release_id,
           s.target_release_number, s.paused_at, s.last_synced_content_revision, s.open_conflict_count,
           EXISTS (SELECT 1 FROM academy_feature_flags f
                   WHERE f.academy_id = ${academyId}::uuid AND f.feature = 'LIBRARY_COURSE_SYNC' AND f.is_enabled) AS gate
    FROM course_sync_states s WHERE s.course_id = ${input.copyCourseId}::uuid FOR UPDATE`;
  if (!state) throw new SyncWriteError("NOT_LINKED");
  if (!input.adoption && !input.resolution) {
    if (state.paused_at) return { status: "SKIPPED", reason: "PAUSED" };
    if (!state.gate) return { status: "SKIPPED", reason: "GATE_OFF" };
    if (
      !state.target_release_id ||
      (state.target_release_number <= state.applied_release_number &&
        state.last_synced_content_revision !== null)
    )
      return { status: "SKIPPED", reason: "UP_TO_DATE" };
  }
  const targetId = state.target_release_id!;

  // Reads: release nodes for base and target, exceptions, the copy, open conflicts.
  const releaseIds = [
    ...new Set([targetId, state.base_release_id].filter(Boolean) as string[]),
  ];
  const nodeRows = await tx.$queryRaw<
    Array<{
      release_id: string;
      node_key: string;
      kind: string;
      material_type: string | null;
      parent_key: string | null;
      ordinal: number;
      unit_hashes: unknown;
    }>
  >`
    SELECT release_id, node_key, kind::text AS kind, material_type::text AS material_type, parent_key, ordinal, unit_hashes
    FROM library_release_nodes WHERE release_id = ANY(${releaseIds}::uuid[])`;
  const toView = (row: (typeof nodeRows)[number]) =>
    storedReleaseView({
      nodeKey: row.node_key,
      kind: row.kind,
      materialType: row.material_type,
      parentKey: row.parent_key,
      ordinal: row.ordinal,
      unitHashes: row.unit_hashes,
    });
  const theirs = new Map<string, ReleaseNodeView>();
  const base = new Map<string, ReleaseNodeView>();
  for (const row of nodeRows) {
    if (row.release_id === targetId) theirs.set(row.node_key, toView(row));
    if (row.release_id === state.base_release_id)
      base.set(row.node_key, toView(row));
  }
  const [release] = await tx.$queryRaw<
    Array<{ number: number; library_content_revision: number }>
  >`
    SELECT number, library_content_revision FROM library_releases WHERE id = ${targetId}::uuid`;

  const exceptionRows = await tx.$queryRaw<
    Array<{
      node_key: string;
      unit_key: string;
      base_state: string;
      base_hash: string | null;
    }>
  >`
    SELECT node_key, unit_key, base_state::text AS base_state, base_hash FROM library_sync_bases WHERE copy_course_id = ${input.copyCourseId}::uuid`;
  const exceptions = new Map<string, Map<string, BaseRef>>();
  for (const row of exceptionRows) {
    const ref: BaseRef =
      row.base_state === "VALUE"
        ? { state: "VALUE", hash: row.base_hash! }
        : row.base_state === "UNKNOWN"
          ? { state: "UNKNOWN" }
          : { state: "ABSENT" };
    const forNode = exceptions.get(row.node_key) ?? new Map<string, BaseRef>();
    forNode.set(row.unit_key, ref);
    exceptions.set(row.node_key, forNode);
  }

  const copy = (await readCourseProjection(tx, input.copyCourseId, {
    mode: "digest",
  }))!;
  const keys = copyKeyMap(copy, state.library_course_id);
  const oursNodes = projectNodes(copy, keys);
  const rowIds = new Set(
    oursNodes.map((node) => `${node.kind}:${node.localId}`),
  );
  const linkByKey = new Map(copy.links.map((link) => [link.nodeKey, link]));
  const ours = new Map<string, OursNodeView>();
  for (const node of oursNodes) {
    const link = node.kind === "COURSE" ? null : linkByKey.get(node.key);
    const linkState =
      node.kind === "COURSE"
        ? "LINKED"
        : link && link.localId === node.localId
          ? (link.state as "LINKED" | "ARCHIVED")
          : null;
    ours.set(node.key, oursView(node, linkState));
  }
  // A live link whose row is gone was deleted by the academy: a tombstone.
  const tombstones = new Map<string, TombstoneState>();
  const newTombstones: string[] = [];
  for (const link of copy.links) {
    if (
      link.state === "LOCAL_DELETED" ||
      link.state === "DETACHED" ||
      link.state === "CLOSED"
    ) {
      tombstones.set(link.nodeKey, link.state);
    } else if (!link.localId || !rowIds.has(`${link.kind}:${link.localId}`)) {
      tombstones.set(link.nodeKey, "LOCAL_DELETED");
      newTombstones.push(link.nodeKey);
    }
  }

  // Order-unit values for base and theirs, in one read.
  const orderHashes = new Set<string>();
  for (const view of [...base.values(), ...theirs.values()])
    for (const [unitKey, hash] of Object.entries(view.unitHashes))
      if (isOrderUnit(unitKey)) orderHashes.add(hash);
  for (const forNode of exceptions.values())
    for (const [unitKey, ref] of forNode)
      if (
        (isOrderUnit(unitKey) ||
          unitKey === "@parent" ||
          unitKey === "@order") &&
        ref.state === "VALUE"
      )
        orderHashes.add(ref.hash);
  const orderValues = await readValues(tx, orderHashes);
  const orderList = (
    side: "base" | "theirs",
    nodeKey: string,
    unitKey: string,
  ): string[] => {
    const exception =
      side === "base" ? exceptions.get(nodeKey)?.get(unitKey) : undefined;
    const hash =
      exception?.state === "VALUE"
        ? exception.hash
        : (side === "base" ? base : theirs).get(nodeKey)?.unitHashes[unitKey];
    const value = hash ? orderValues.get(hash) : undefined;
    return Array.isArray(value) ? (value as string[]) : [];
  };

  const quarantined = new Set(
    copy.links.filter((l) => l.meta?.legacyUnmatched).map((l) => l.nodeKey),
  );
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of theirs.values())
      if (
        n.parentKey &&
        quarantined.has(n.parentKey) &&
        !quarantined.has(n.key)
      ) {
        quarantined.add(n.key);
        grew = true;
      }
  }
  for (const link of copy.links)
    if (
      link.state === "LOCAL_DELETED" &&
      link.meta?.legacyDeletedBase &&
      !base.has(link.nodeKey)
    )
      base.set(link.nodeKey, storedReleaseView(link.meta.legacyDeletedBase));
  const structuralBase = new Map<string, string | null | string[]>();
  for (const [nodeKey, refs] of exceptions)
    for (const [unit, ref] of refs)
      if (
        (unit === "@parent" || unit === "@order") &&
        ref.state === "VALUE" &&
        orderValues.has(ref.hash)
      )
        structuralBase.set(
          nodeKey + unit,
          orderValues.get(ref.hash) as string | null | string[],
        );
  const plan = planMerge({
    structuralBase,
    quarantined,
    courseKey: state.library_course_id,
    base,
    exceptions,
    theirs,
    ours,
    tombstones,
    orderList,
  });

  const structuralValues: Array<{ hash: string; value: CanonicalValue }> = [];
  for (const conflict of plan.nodeConflicts) {
    if (conflict.unitKey !== "@parent" && conflict.unitKey !== "@order")
      continue;
    const old = exceptions.get(conflict.nodeKey)?.get(conflict.unitKey);
    if (old) {
      if (
        !plan.exceptions.some(
          (e) =>
            e.nodeKey === conflict.nodeKey && e.unitKey === conflict.unitKey,
        )
      )
        plan.exceptions.push({
          nodeKey: conflict.nodeKey,
          unitKey: conflict.unitKey,
          base: old,
        });
      continue;
    }
    const value =
      conflict.unitKey === "@parent"
        ? (base.get(conflict.nodeKey)?.parentKey ?? null)
        : [...base.values()]
            .filter((n) => n.parentKey === conflict.nodeKey)
            .sort((a, b) => a.ordinal - b.ordinal)
            .map((n) => n.key);
    const hash = unitHash(conflict.unitKey, value);
    structuralValues.push({ hash, value });
    plan.exceptions.push({
      nodeKey: conflict.nodeKey,
      unitKey: conflict.unitKey,
      base: { state: "VALUE", hash },
    });
  }
  await storeValues(tx, structuralValues);

  // Values the plan applies or adds, and the copy's own full rows where it writes.
  const neededHashes = new Set<string>();
  for (const unit of plan.units) {
    if (unit.outcome === "APPLIED" && unit.theirsHash)
      neededHashes.add(unit.theirsHash);
    if (
      unit.outcome === "APPLIED" &&
      unit.unitKey === "exercise.gradingProfile"
    ) {
      const semantic = theirs.get(unit.nodeKey)?.unitHashes["@semanticVersion"];
      if (semantic) neededHashes.add(semantic);
    }
  }
  for (const key of plan.adds)
    for (const hash of Object.values(theirs.get(key)!.unitHashes))
      neededHashes.add(hash);
  for (const key of plan.restores)
    for (const hash of Object.values(theirs.get(key)?.unitHashes ?? {}))
      neededHashes.add(hash);
  const values = await readValues(tx, neededHashes);
  const conflictNodes = new Set(
    plan.units
      .filter((unit) => unit.outcome === "CONFLICT")
      .map((unit) => unit.nodeKey),
  );
  const touched = new Set<string>([
    ...plan.units
      .filter((unit) => unit.outcome === "APPLIED")
      .map((unit) => unit.nodeKey),
    ...plan.itemOrders.keys(),
    ...plan.restores,
  ]);
  const fullIds = [...new Set([...touched, ...conflictNodes])]
    .map((key) => ours.get(key))
    .filter((view): view is OursNodeView => !!view && view.kind === "MATERIAL")
    .map((view) => view.localId);
  const fullCopy: ProjectedCourse = (await readCourseProjection(
    tx,
    input.copyCourseId,
    { mode: "full", materialIds: fullIds },
  ))!;
  const oursFull = new Map<string, SyncNode>(
    projectNodes(fullCopy, copyKeyMap(fullCopy, state.library_course_id)).map(
      (node) => [node.key, node],
    ),
  );

  const linked = new Map<string, string>();
  const optionMaps = new Map<string, Record<string, string>>();
  for (const link of copy.links) {
    if (link.localId && (link.state === "LINKED" || link.state === "ARCHIVED"))
      linked.set(link.nodeKey, link.localId);
    if (link.meta?.optionMap) optionMaps.set(link.nodeKey, link.meta.optionMap);
  }

  const oursUnits = new Map(oursNodes.map((node) => [node.key, node.units]));
  const invalid = await validatePlan(tx, {
    plan,
    theirs,
    ours,
    oursUnits,
    oursFull,
    values,
    academyId,
    copyCourseId: input.copyCourseId,
    courseLanguage: course[0].language,
  });

  // Unproved legacy item identities are decided as a complete list. Applying
  // only its structure would otherwise drop wording or create duplicate cases.
  const unknownGroups = new Map<
    string,
    { nodeKey: string; units: string[]; message: string }
  >();
  for (const u of plan.units) {
    if (u.outcome !== "CONFLICT" || u.conflictKind !== "UNKNOWN_BASE") continue;
    const family =
      u.unitKey.startsWith("mc.option:") || u.unitKey === "mc.structure"
        ? "mc"
        : /^exercise\.(testCase|testCases)/.test(u.unitKey)
          ? "cases"
          : /^exercise\.(solution|solutions)/.test(u.unitKey)
            ? "solutions"
            : /^exercise\.(hint|hints)/.test(u.unitKey)
              ? "hints"
              : null;
    if (!family) continue;
    const id = u.nodeKey + ":" + family;
    const g = unknownGroups.get(id) ?? {
      nodeKey: u.nodeKey,
      units: [],
      message:
        "Historical item identity is unknown. Review this complete definition.",
    };
    g.units.push(u.unitKey);
    unknownGroups.set(id, g);
  }
  invalid.push(...unknownGroups.values());
  const write = await applyPlan(tx, {
    copyCourseId: input.copyCourseId,
    courseKey: state.library_course_id,
    plan,
    theirs,
    ours,
    oursFull,
    values,
    linked,
    optionMaps,
    existingKeys: existingKeysOf(copy),
    visibility: (input.adoption
      ? "ADOPTION"
      : "SYNC_ADDITION") satisfies VisibilityPolicy,
  });

  // ---------------------------------------------------------------- links
  const linkRows = [...write.addedIds].map(([nodeKey, localId]) => ({
    copyCourseId: input.copyCourseId,
    nodeKey,
    kind: theirs.get(nodeKey)!.kind as "MODULE",
    localId,
    state: "LINKED" as const,
    evidence: "ADOPTED" as const,
    meta: (write.optionMaps.has(nodeKey)
      ? { optionMap: write.optionMaps.get(nodeKey) }
      : {}) as Prisma.InputJsonValue,
  }));
  if (linkRows.length) await tx.librarySyncLink.createMany({ data: linkRows });
  const linkUpdates: Array<Record<string, unknown>> = [];
  const visibilityRestores: Array<{
    kind: string;
    id: string;
    visible: boolean;
  }> = [];
  for (const key of plan.archives) {
    const view = ours.get(key)!;
    linkUpdates.push({
      node_key: key,
      state: "ARCHIVED",
      local_id: view.localId,
      archived_visibility: view.isVisible,
      archived_at: new Date().toISOString(),
      meta: null,
    });
  }
  for (const key of plan.restores) {
    const link = linkByKey.get(key)!;
    visibilityRestores.push({
      kind: link.kind,
      id: link.localId!,
      visible: link.archivedVisibility ?? true,
    });
    linkUpdates.push({
      node_key: key,
      state: "LINKED",
      local_id: link.localId,
      archived_visibility: null,
      archived_at: null,
      meta: null,
    });
  }
  for (const key of plan.closes)
    linkUpdates.push({
      node_key: key,
      state: "CLOSED",
      local_id: null,
      archived_visibility: null,
      archived_at: null,
      meta: null,
    });
  for (const key of newTombstones)
    if (!plan.closes.includes(key))
      linkUpdates.push({
        node_key: key,
        state: "LOCAL_DELETED",
        local_id: null,
        archived_visibility: null,
        archived_at: null,
        meta: null,
      });
  for (const [nodeKey, optionMap] of write.optionMaps)
    if (!write.addedIds.has(nodeKey)) {
      const link = linkByKey.get(nodeKey)!;
      linkUpdates.push({
        node_key: nodeKey,
        state: link.state,
        local_id: link.localId,
        archived_visibility: link.archivedVisibility,
        archived_at: null,
        meta: { optionMap },
      });
    }
  if (linkUpdates.length) {
    const payload = JSON.stringify(linkUpdates);
    await tx.$executeRaw`
      UPDATE library_sync_links AS k SET
        state = v.state::"LibrarySyncLinkState", local_id = v.local_id,
        archived_visibility = v.archived_visibility, archived_at = v.archived_at,
        meta = coalesce(v.meta, k.meta), updated_at = now()
      FROM jsonb_to_recordset(${payload}::jsonb)
        AS v(node_key uuid, state text, local_id uuid, archived_visibility boolean, archived_at timestamptz, meta jsonb)
      WHERE k.copy_course_id = ${input.copyCourseId}::uuid AND k.node_key = v.node_key`;
  }
  for (const kind of ["MODULE", "LECTURE", "MATERIAL"] as const) {
    const rows = visibilityRestores.filter((row) => row.kind === kind);
    if (!rows.length) continue;
    const table =
      kind === "MODULE"
        ? "course_modules"
        : kind === "LECTURE"
          ? "lectures"
          : "materials";
    await tx.$executeRaw(Prisma.sql`
      UPDATE ${Prisma.raw(table)} AS t SET is_visible = v.visible
      FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS v(id uuid, visible boolean)
      WHERE t.id = v.id`);
  }

  // --------------------------------------------------------------- conflicts
  const conflictsResult = await reconcileConflicts(tx, {
    copyCourseId: input.copyCourseId,
    targetId,
    plan,
    invalid,
    oursFull,
  });

  // ---------------------------------------------------------- base exceptions
  await tx.librarySyncBase.deleteMany({
    where: { copyCourseId: input.copyCourseId },
  });
  const exceptionMap = new Map<
    string,
    { nodeKey: string; unitKey: string; base: BaseRef }
  >();
  for (const exception of plan.exceptions) {
    const id = `${exception.nodeKey}\u0000${exception.unitKey}`;
    if (!exceptionMap.has(id)) exceptionMap.set(id, exception);
  }
  if (exceptionMap.size)
    await tx.librarySyncBase.createMany({
      data: [...exceptionMap.values()].map((exception) => ({
        copyCourseId: input.copyCourseId,
        nodeKey: exception.nodeKey,
        unitKey: exception.unitKey,
        baseState: exception.base.state,
        baseHash: exception.base.state === "VALUE" ? exception.base.hash : null,
      })),
    });

  // ----------------------------------------------------------------- history
  const changes: Array<{ nodeKey: string; unitKey: string; outcome: string }> =
    [];
  for (const unit of plan.units) {
    if (unit.outcome === "APPLIED")
      changes.push({
        nodeKey: unit.nodeKey,
        unitKey: unit.unitKey,
        outcome: "APPLIED",
      });
    else if (unit.outcome === "CONFLICT")
      changes.push({
        nodeKey: unit.nodeKey,
        unitKey: unit.unitKey,
        outcome: "CONFLICT",
      });
    else if (
      unit.outcome === "CONVERGED" &&
      unit.theirsHash !== (unit.base.state === "VALUE" ? unit.base.hash : null)
    )
      changes.push({
        nodeKey: unit.nodeKey,
        unitKey: unit.unitKey,
        outcome: "CONVERGED",
      });
  }
  for (const key of write.addedIds.keys())
    changes.push({ nodeKey: key, unitKey: "@presence", outcome: "ADDED" });
  for (const key of plan.archives)
    changes.push({ nodeKey: key, unitKey: "@presence", outcome: "ARCHIVED" });
  for (const key of plan.restores)
    changes.push({ nodeKey: key, unitKey: "@presence", outcome: "RESTORED" });
  for (const key of plan.parents.keys())
    if (!write.addedIds.has(key))
      changes.push({ nodeKey: key, unitKey: "@parent", outcome: "MOVED" });
  for (const conflict of plan.nodeConflicts)
    changes.push({
      nodeKey: conflict.nodeKey,
      unitKey: conflict.unitKey,
      outcome: "CONFLICT",
    });
  if (changes.length && !input.adoption && !input.resolution)
    await tx.librarySyncChange.createMany({
      data: changes.map((change) => ({
        jobId: input.fence?.jobId ?? null,
        copyCourseId: input.copyCourseId,
        releaseId: targetId,
        nodeKey: isLocalKey(change.nodeKey)
          ? change.nodeKey.slice("local:".length)
          : change.nodeKey,
        unitKey: change.unitKey,
        outcome: change.outcome as "APPLIED",
      })),
    });

  // ------------------------------------------------------------ course, state
  const divergent = plan.units.filter(
    (unit) =>
      !isMetaUnit(unit.unitKey) &&
      (unit.outcome === "KEPT" || unit.outcome === "CONFLICT"),
  ).length;
  const contentWritten = write.wroteContent && !input.adoption;
  const [updated] = await tx.$queryRaw<Array<{ content_revision: number }>>`
    UPDATE courses SET
      content_revision = content_revision + ${contentWritten ? 1 : 0},
      source_content_revision = ${release!.library_content_revision},
      updated_at = CASE WHEN ${contentWritten} THEN now() ELSE updated_at END
    WHERE id = ${input.copyCourseId}::uuid
    RETURNING content_revision`;
  await tx.$executeRaw`
    UPDATE course_sync_states SET
      base_release_id = ${targetId}::uuid,
      applied_release_number = GREATEST(applied_release_number, ${release!.number}),
      status = CASE WHEN target_release_number > GREATEST(applied_release_number, ${release!.number}) THEN 'PENDING'::"LibrarySyncStatus" ELSE 'IDLE'::"LibrarySyncStatus" END,
      open_conflict_count = ${conflictsResult.openCount},
      review_version = review_version + ${!input.adoption && !input.resolution && conflictsResult.hasNewAdminChange ? 1 : 0},
      review_updated_at = CASE WHEN ${!input.adoption && !input.resolution && conflictsResult.hasNewAdminChange} THEN now() ELSE review_updated_at END,
      divergent_unit_count = ${divergent},
      last_synced_content_revision = ${updated!.content_revision},
      last_run_at = now(),
      last_error_code = NULL,
      updated_at = now()
    WHERE course_id = ${input.copyCourseId}::uuid`;
  await refreshReviewItems(tx, input.copyCourseId);

  const summary = {
    applied: plan.units.filter((unit) => unit.outcome === "APPLIED").length,
    converged: plan.units.filter((unit) => unit.outcome === "CONVERGED").length,
    kept: plan.units.filter((unit) => unit.outcome === "KEPT").length,
    conflicts: conflictsResult.openCount,
    added: write.addedIds.size,
    archived: plan.archives.length,
    restored: plan.restores.length,
    moved: [...plan.parents.keys()].filter((key) => !write.addedIds.has(key))
      .length,
    gradingChanged: write.gradingChanged.length,
  };
  if (!input.adoption && !input.resolution)
    await audit.writeSystem(tx, {
      academyId,
      action: "content.library_sync.applied",
      targetType: "Course",
      targetId: input.copyCourseId,
      after: {
        releaseNumber: release!.number,
        fromReleaseNumber: state.applied_release_number,
        ...summary,
      },
    });
  return {
    status: "APPLIED",
    summary,
    archivedLocalIds: write.archivedLocalIds,
    academyId,
    releaseNumber: release!.number,
    reviewChanged: conflictsResult.hasNewAdminChange || conflictsResult.openCount !== state.open_conflict_count,
  };
}

function existingKeysOf(copy: ProjectedCourse) {
  const modules = new Set<string>();
  const lectures = new Set<string>();
  const exercises = new Set<string>();
  for (const courseModule of copy.modules) {
    modules.add(courseModule.externalKey);
    for (const lecture of courseModule.lectures) {
      lectures.add(lecture.externalKey);
      for (const material of lecture.materials)
        if (material.exercise) exercises.add(material.exercise.externalKey);
    }
  }
  return { modules, lectures, exercises };
}

type InvalidGroup = { nodeKey: string; units: string[]; message: string };

/** Placements under which a PDF may be an exercise's reference (`validatePdfReference`). */
const REFERENCE_PLACEMENTS = new Set(["SUPPLEMENTARY", "BOTH"]);
const REFERENCED_PDF =
  "An exercise in this course uses this PDF as its reference.";

/**
 * Hold back library units that would leave a material invalid, to a fixed
 * point (design §8.3). Mutates the plan: held-back units become conflicts,
 * and an invalid addition is not added.
 */
async function validatePlan(
  tx: Tx,
  context: {
    plan: Plan;
    theirs: ReadonlyMap<string, ReleaseNodeView>;
    ours: ReadonlyMap<string, OursNodeView>;
    /** Every copy node's units as read in digest mode: plain values are whole. */
    oursUnits: ReadonlyMap<string, Record<string, CanonicalValue>>;
    oursFull: ReadonlyMap<string, SyncNode>;
    values: ReadonlyMap<string, CanonicalValue>;
    academyId: string;
    courseLanguage: string;
    copyCourseId: string;
  },
): Promise<InvalidGroup[]> {
  const { plan } = context;
  const groups: InvalidGroup[] = [];

  /** A plain unit's value after this plan: theirs for an addition or an applied unit, else the copy's. */
  const mergedValue = (
    key: string,
    unitKey: string,
  ): CanonicalValue | undefined => {
    if (plan.adds.includes(key)) {
      const hash = context.theirs.get(key)?.unitHashes[unitKey];
      return hash ? context.values.get(hash) : undefined;
    }
    const applied = plan.units.find(
      (unit) =>
        unit.nodeKey === key &&
        unit.unitKey === unitKey &&
        unit.outcome === "APPLIED",
    );
    if (applied)
      return applied.theirsHash
        ? context.values.get(applied.theirsHash)
        : undefined;
    return context.oursUnits.get(key)?.[unitKey];
  };
  const typeOf = (key: string) =>
    plan.adds.includes(key)
      ? context.theirs.get(key)?.materialType
      : context.ours.get(key)?.materialType;
  /** Present after this plan: not archived now or before (unless restored), or arriving. */
  const present = (key: string) => {
    if (plan.adds.includes(key)) return true;
    const view = context.ours.get(key);
    return (
      !!view &&
      !plan.archives.includes(key) &&
      (view.linkState !== "ARCHIVED" || plan.restores.includes(key))
    );
  };
  const pdfAvailable = (key: string) =>
    typeOf(key) === "PDF_DOCUMENT" &&
    present(key) &&
    REFERENCE_PLACEMENTS.has(String(mergedValue(key, "pdf.placement")));

  /**
   * A surviving exercise's reference to a PDF blocks the PDF's removal and
   * holds back a placement that would no longer allow it (design §9.1). Every
   * exercise counts, not only those this release changes: the academy's own
   * exercises reference library PDFs too.
   */
  const protectReferencedPdfs = () => {
    const referenced = new Set<string>();
    for (const key of [...context.ours.keys(), ...plan.adds]) {
      if (typeOf(key) !== "PROGRAMMING_EXERCISE" || !present(key)) continue;
      const reference = mergedValue(key, "exercise.referencePdf");
      if (typeof reference === "string") referenced.add(reference);
    }
    const archived = new Set(plan.archives);
    // A removed lecture or module holding the PDF stays whole, decided at its top.
    const roots = new Set<string>();
    for (const pdf of referenced) {
      if (!archived.has(pdf)) continue;
      let root = pdf;
      for (
        let parent = context.ours.get(root)?.parentKey;
        parent && archived.has(parent);
        parent = context.ours.get(parent)?.parentKey
      )
        root = parent;
      roots.add(root);
    }
    if (roots.size) {
      const kept = new Set<string>();
      const keep = (key: string) => {
        kept.add(key);
        for (const child of archived)
          if (context.ours.get(child)?.parentKey === key) keep(child);
      };
      roots.forEach(keep);
      plan.archives = plan.archives.filter((key) => !kept.has(key));
      for (const root of roots)
        plan.nodeConflicts.push({
          nodeKey: root,
          unitKey: "@presence",
          kind: "REMOVED_UPSTREAM_HAS_LOCAL_CONTENT",
          detail: { message: REFERENCED_PDF, reason: "REFERENCED_PDF" },
        });
    }
    for (const pdf of referenced) {
      const placement = plan.units.find(
        (unit) =>
          unit.nodeKey === pdf &&
          unit.unitKey === "pdf.placement" &&
          unit.outcome === "APPLIED",
      );
      if (
        !placement ||
        REFERENCE_PLACEMENTS.has(String(mergedValue(pdf, "pdf.placement")))
      )
        continue;
      holdBack(plan, pdf, ["pdf.placement"]);
      groups.push({
        nodeKey: pdf,
        units: ["pdf.placement"],
        message: REFERENCED_PDF,
      });
    }
  };
  protectReferencedPdfs();

  // A removed MC option whose wording the academy edited holds back the structure.
  for (const unit of plan.units)
    if (unit.unitKey === "mc.structure" && unit.outcome === "APPLIED") {
      const editedRemoval = plan.units.some(
        (other) =>
          other.nodeKey === unit.nodeKey &&
          other.unitKey.startsWith("mc.option:") &&
          other.conflictKind === "REMOVED_UPSTREAM_EDITED_LOCALLY",
      );
      if (editedRemoval) {
        holdBack(plan, unit.nodeKey, ["mc.structure"]);
        groups.push({
          nodeKey: unit.nodeKey,
          units: ["mc.structure"],
          message: "An option the library removed has your wording.",
        });
      }
    }

  for (let pass = 0; pass < 3; pass += 1) {
    const decisions = decisionsByNode(plan);
    let changed = false;
    const candidates = new Set<string>([
      ...plan.units
        .filter((unit) => unit.outcome === "APPLIED")
        .map((unit) => unit.nodeKey),
      ...plan.adds,
    ]);
    for (const key of candidates) {
      const added = plan.adds.includes(key);
      const kind = added
        ? context.theirs.get(key)?.kind
        : context.ours.get(key)?.kind;
      const type = added
        ? context.theirs.get(key)?.materialType
        : context.ours.get(key)?.materialType;
      if (kind === "COURSE") continue;
      if (kind !== "MATERIAL" || !type) continue;
      const merged = mergedUnitsFor({ ...context }, key, decisions, added);
      const message = validateMaterial(
        type,
        merged,
        { pdfAvailable, courseLanguage: context.courseLanguage },
        added ? null : (context.oursFull.get(key)?.units ?? null),
      );
      if (!message) continue;
      changed = true;
      if (added) {
        plan.adds = plan.adds.filter((candidate) => candidate !== key);
        plan.parents.delete(key);
        plan.nodeConflicts.push({
          nodeKey: key,
          unitKey: "@presence",
          kind: "INVALID_RESULT",
          detail: { message },
        });
        // Its children cannot land without it.
        const dropped = new Set([key]);
        for (const child of [...plan.adds])
          if (dropped.has(context.theirs.get(child)?.parentKey ?? "")) {
            dropped.add(child);
            plan.adds = plan.adds.filter((candidate) => candidate !== child);
          }
        for (const [parentKey, order] of plan.orders)
          plan.orders.set(
            parentKey,
            order.filter((child) => !dropped.has(child)),
          );
      } else {
        const units = (decisions.get(key) ?? [])
          .filter((unit) => unit.outcome === "APPLIED")
          .map((unit) => unit.unitKey);
        holdBack(plan, key, units);
        groups.push({ nodeKey: key, units, message });
      }
    }
    if (!changed) break;
  }
  // A unit held back above can restore a reference to a PDF this plan removes.
  protectReferencedPdfs();

  // Course title must stay unique within the academy.
  const title = plan.units.find(
    (unit) => unit.unitKey === "course.title" && unit.outcome === "APPLIED",
  );
  if (title?.theirsHash) {
    const next = context.values.get(title.theirsHash) as string;
    const clash = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM courses WHERE academy_id = ${context.academyId}::uuid AND id <> ${context.copyCourseId}::uuid
        AND lower(title) = lower(${next}) LIMIT 1`;
    if (clash[0]) {
      holdBack(plan, title.nodeKey, ["course.title"]);
      groups.push({
        nodeKey: title.nodeKey,
        units: ["course.title"],
        message: "Another course in this academy already has that title.",
      });
    }
  }
  return groups;
}

function holdBack(plan: Plan, nodeKey: string, unitKeys: readonly string[]) {
  const held = new Set(unitKeys);
  for (const unit of plan.units)
    if (
      unit.nodeKey === nodeKey &&
      held.has(unit.unitKey) &&
      unit.outcome === "APPLIED"
    ) {
      unit.outcome = "CONFLICT";
      unit.conflictKind = "INVALID_RESULT";
      plan.exceptions.push({ nodeKey, unitKey: unit.unitKey, base: unit.base });
    }
  const orders = plan.itemOrders.get(nodeKey);
  if (orders) for (const unitKey of held) orders.delete(unitKey);
  if (orders && orders.size === 0) plan.itemOrders.delete(nodeKey);
}

/**
 * Open, update or close conflicts against the plan (design §13.1), persisting
 * the copy's value of every conflicted unit and pinning the assets those
 * values refer to.
 */
async function reconcileConflicts(
  tx: Tx,
  input: {
    copyCourseId: string;
    targetId: string;
    plan: Plan;
    invalid: InvalidGroup[];
    oursFull: ReadonlyMap<string, SyncNode>;
  },
): Promise<{ openCount: number; hasNewAdminChange: boolean }> {
  const existing = await tx.librarySyncConflict.findMany({
    where: { copyCourseId: input.copyCourseId, status: "OPEN" },
    select: {
      id: true,
      nodeKey: true,
      unitKey: true,
      kind: true,
      groupId: true,
      theirsHash: true,
      detail: true,
    },
  });
  const byUnit = new Map(
    existing.map((row) => [`${row.nodeKey}\u0000${row.unitKey}`, row]),
  );
  const groupOf = new Map<string, string>();
  for (const group of input.invalid) {
    const groupId = randomUUID();
    for (const unitKey of group.units)
      groupOf.set(`${group.nodeKey}\u0000${unitKey}`, groupId);
  }
  const messageOf = new Map<string, string>();
  for (const group of input.invalid)
    for (const unitKey of group.units)
      messageOf.set(`${group.nodeKey}\u0000${unitKey}`, group.message);

  type Draft = {
    nodeKey: string;
    unitKey: string;
    kind: string;
    base: BaseRef;
    oursHash: string | null;
    theirsHash: string | null;
    detail: Record<string, unknown>;
  };
  const drafts: Draft[] = [];
  for (const unit of input.plan.units)
    if (unit.outcome === "CONFLICT")
      drafts.push({
        nodeKey: unit.nodeKey,
        unitKey: unit.unitKey,
        kind: unit.conflictKind ?? "CONCURRENT_EDIT",
        base: unit.base,
        oursHash: unit.oursHash,
        theirsHash: unit.theirsHash,
        detail: messageOf.has(`${unit.nodeKey}\u0000${unit.unitKey}`)
          ? {
              message: messageOf.get(`${unit.nodeKey}\u0000${unit.unitKey}`),
              ...(messageOf.get(`${unit.nodeKey}\u0000${unit.unitKey}`) ===
              REFERENCED_PDF
                ? { reason: "REFERENCED_PDF" }
                : {}),
            }
          : {},
      });
  for (const conflict of input.plan.nodeConflicts)
    drafts.push({
      nodeKey: conflict.nodeKey,
      unitKey: conflict.unitKey,
      kind: conflict.kind,
      base: { state: "ABSENT" },
      oursHash: null,
      theirsHash: null,
      detail: conflict.detail ?? {},
    });

  // The copy's side of every conflicted unit, persisted in full.
  const oursValues: Array<{ hash: string; value: CanonicalValue }> = [];
  for (const draft of drafts) {
    if (!draft.oursHash) continue;
    const value = input.oursFull.get(draft.nodeKey)?.units[draft.unitKey];
    if (value !== undefined) oursValues.push({ hash: draft.oursHash, value });
  }
  await storeValues(tx, oursValues);

  const seen = new Set<string>();
  const inserts: Prisma.LibrarySyncConflictCreateManyInput[] = [];
  const updates: Array<Record<string, unknown>> = [];
  let hasNewAdminChange = false;
  for (const draft of drafts) {
    const id = `${draft.nodeKey}\u0000${draft.unitKey}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const current = byUnit.get(id);
    // A publication touching unrelated content must not re-alert an academy
    // about an unchanged pending decision. Group ids and release ids can change
    // without the disputed admin value changing.
    if (!current || current.theirsHash !== draft.theirsHash || current.kind !== draft.kind ||
      canonicalJson(current.detail as CanonicalValue) !== canonicalJson(draft.detail as CanonicalValue)) hasNewAdminChange = true;
    const row = {
      kind: draft.kind as "CONCURRENT_EDIT",
      baseState: draft.base.state,
      baseHash: draft.base.state === "VALUE" ? draft.base.hash : null,
      oursHash: draft.oursHash,
      theirsHash: draft.theirsHash,
      theirsReleaseId: input.targetId,
      detail: draft.detail as Prisma.InputJsonValue,
    };
    if (current)
      updates.push({
        id: current.id,
        groupId: groupOf.get(id) ?? current.groupId,
        ...row,
        baseState: row.baseState,
        detail: draft.detail,
      });
    else {
      const conflictId = randomUUID();
      inserts.push({
        id: conflictId,
        groupId: groupOf.get(id) ?? conflictId,
        copyCourseId: input.copyCourseId,
        nodeKey: draft.nodeKey,
        unitKey: draft.unitKey,
        ...row,
      });
    }
  }
  if (inserts.length)
    await tx.librarySyncConflict.createMany({ data: inserts });
  if (updates.length) {
    const payload = JSON.stringify(
      updates.map((row) => ({
        id: row.id,
        group_id: row.groupId,
        kind: row.kind,
        base_state: row.baseState,
        base_hash: row.baseHash,
        ours_hash: row.oursHash,
        theirs_hash: row.theirsHash,
        detail: row.detail,
      })),
    );
    await tx.$executeRaw`
      UPDATE library_sync_conflicts AS c SET group_id = v.group_id, kind = v.kind::"LibrarySyncConflictKind", base_state = v.base_state::"LibrarySyncBaseState",
        base_hash = v.base_hash, ours_hash = v.ours_hash, theirs_hash = v.theirs_hash,
        theirs_release_id = ${input.targetId}::uuid, detail = v.detail, updated_at = now()
      FROM jsonb_to_recordset(${payload}::jsonb) AS v(id uuid, group_id uuid, kind text, base_state text, base_hash text, ours_hash text, theirs_hash text, detail jsonb)
      WHERE c.id = v.id`;
  }

  // Conflicts this run no longer raises close, including converged placement.
  const decided = new Map(
    input.plan.units.map((unit) => [
      `${unit.nodeKey}\u0000${unit.unitKey}`,
      unit.outcome,
    ]),
  );
  const closing = existing.filter(
    (row) => !seen.has(`${row.nodeKey}\u0000${row.unitKey}`),
  );
  const converged = closing
    .filter(
      (row) =>
        decided.get(`${row.nodeKey}\u0000${row.unitKey}`) === "CONVERGED",
    )
    .map((row) => row.id);
  const obsolete = closing
    .filter(
      (row) =>
        decided.get(`${row.nodeKey}\u0000${row.unitKey}`) !== "CONVERGED",
    )
    .map((row) => row.id);
  if (converged.length)
    await tx.librarySyncConflict.updateMany({
      where: { id: { in: converged } },
      data: {
        status: "RESOLVED",
        resolution: "CONVERGED",
        resolvedAt: new Date(),
      },
    });
  if (obsolete.length)
    await tx.librarySyncConflict.updateMany({
      where: { id: { in: obsolete } },
      data: { status: "OBSOLETE", resolvedAt: new Date() },
    });

  // Pin assets the conflicted values refer to (design §12).
  const refs = new Map<
    string,
    Prisma.LibrarySyncAssetReferenceCreateManyInput
  >();
  for (const draft of drafts) {
    const value = input.oursFull.get(draft.nodeKey)?.units[draft.unitKey];
    if (value === undefined) continue;
    for (const ref of assetRefsOf(draft.unitKey, value))
      refs.set(`${draft.nodeKey}:${ref.kind}:${ref.assetId}`, {
        ownerKind: "CONFLICT",
        ownerId: input.copyCourseId,
        assetKind: ref.kind,
        assetId: ref.assetId,
      });
  }
  if (refs.size)
    await tx.librarySyncAssetReference.createMany({
      data: [...refs.values()],
      skipDuplicates: true,
    });

  const openCount = existing.length - closing.length + inserts.length;
  return { openCount, hasNewAdminChange };
}
