import { Injectable, HttpStatus } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AcademyAccessService } from "../authorization/academy-access.service.js";
import { PlatformAccessService } from "../authorization/platform-access.service.js";
import { AuditService } from "../academies/audit.service.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { Prisma } from "../generated/prisma/client.js";
import { copyKeyMap, projectNodes } from "./catalog.js";
import { canonicalJson } from "./canonical.js";
import { hashUnits, storedReleaseView } from "./nodes.js";
import { readCourseProjection } from "./projection.js";
import { readValues } from "./values.js";
import { LibrarySyncJobService } from "./sync-job.service.js";
import { latestRelease } from "./release-access.js";

type Tx = Prisma.TransactionClient;
const deny = () =>
  new AppException("CONTENT_EDIT_CONFLICT", HttpStatus.CONFLICT);
type Candidate = {
  nodeKey: string;
  kind: string;
  materialType: string | null;
  title: string;
  localId: string | null;
};

/** Legacy identity is separate from historical base. Historical audit absence is never used as proof. */
@Injectable()
export class LegacyLibraryLinkService {
  constructor(
    private readonly db: PrismaService,
    private readonly platform: PlatformAccessService,
    private readonly access: AcademyAccessService,
    private readonly audit: AuditService,
    private readonly jobs: LibrarySyncJobService,
  ) {}

  async report(identity: SupabaseIdentity, input: { courseId: string }) {
    await this.platform.requirePermission(
      identity.authUserId,
      "platform.library.read",
    );
    const rows = await this.db.$queryRaw<
      Array<{
        courseId: string;
        academyId: string;
        academyName: string;
        title: string;
        revision: number;
        linked: boolean;
        releaseId: string | null;
      }>
    >`
      SELECT cp.id AS "courseId", cp.academy_id AS "academyId", a.name AS "academyName", cp.title, cp.content_revision AS revision,
        EXISTS(SELECT 1 FROM course_sync_states s WHERE s.course_id=cp.id) AS linked,
        (SELECT id FROM library_releases r WHERE r.library_course_id=m.id ORDER BY number DESC LIMIT 1) AS "releaseId"
      FROM courses m JOIN academies lib ON lib.id=m.academy_id AND lib.kind='LIBRARY'
      JOIN courses cp ON cp.source_course_id=m.id JOIN academies a ON a.id=cp.academy_id AND a.organization_id=lib.organization_id AND a.kind='ACADEMY'
      WHERE m.id=${input.courseId}::uuid ORDER BY a.name,cp.id`;
    return { copies: rows };
  }

  async preview(identity: SupabaseIdentity, input: { copyCourseId: string }) {
    await this.platform.requirePermission(
      identity.authUserId,
      "platform.library.manage",
    );
    const report = await this.db.$transaction(
      (tx) => this.inspect(tx, input.copyCourseId),
      { timeout: 60_000 },
    );
    return {
      hash: report.hash,
      releaseId: report.releaseId,
      releaseNumber: report.releaseNumber,
      nodeCount: report.nodes.length,
    };
  }

  /** Read-only, academy-scoped candidate content. Platform reports above never return these values. */
  async unmatched(
    identity: SupabaseIdentity,
    input: { academyId: string; courseId: string },
  ) {
    await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "curriculum.review",
    );
    return this.db.$transaction(
      (tx) => this.inspect(tx, input.courseId, input.academyId),
      { timeout: 60_000 },
    );
  }

  /** One copy is one atomic migration work unit; callers never loop SQL over its nodes. */
  async link(
    identity: SupabaseIdentity,
    input: { courseId: string; copyCourseId: string; expectedHash: string },
  ) {
    const actor = await this.platform.requirePermission(
      identity.authUserId,
      "platform.library.manage",
    );
    await this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM courses WHERE id=${input.courseId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM courses WHERE id=${input.copyCourseId}::uuid FOR UPDATE`;
        const report = await this.inspect(tx, input.copyCourseId);
        if (
          report.libraryCourseId !== input.courseId ||
          report.hash !== input.expectedHash ||
          !report.releaseId
        )
          throw deny();
        const existing = await tx.courseSyncState.findUnique({
          where: { courseId: input.copyCourseId },
          select: { courseId: true },
        });
        if (existing) return;
        await tx.courseSyncState.create({
          data: {
            courseId: input.copyCourseId,
            libraryCourseId: input.courseId,
            linkMethod: "LEGACY_LINKED",
            baseReleaseId: null,
            targetReleaseId: report.releaseId,
            targetReleaseNumber: report.releaseNumber,
            status: "PENDING",
          },
        });
        await tx.librarySyncLink.createMany({
          data: report.nodes.map((n) => ({
            copyCourseId: input.copyCourseId,
            nodeKey: n.nodeKey,
            kind: n.kind as "MODULE",
            localId: null,
            state: "LOCAL_DELETED",
            evidence: "MANUAL",
            meta: { legacyUnmatched: true },
          })),
        });
        // UNKNOWN content and structure is explicit, not confused with absent.
        await this.seedBases(tx, input.copyCourseId, input.courseId);
        await this.queue(tx, input.copyCourseId);
        await this.audit.write(tx, {
          actorUserId: actor.userId,
          academyId: report.academyId,
          action: "content.library_sync.legacy_linked",
          targetType: "Course",
          targetId: input.copyCourseId,
          after: {
            libraryCourseId: input.courseId,
            releaseNumber: report.releaseNumber,
            unmatched: report.nodes.length,
            basePolicy: "UNKNOWN",
          },
        });
      },
      { timeout: 60_000 },
    );
    this.jobs.requestDrain();
    return { linked: true };
  }

  /** An academy editor explicitly establishes identity, or acknowledges a local deletion. No guessed matches. */
  async resolveLink(
    identity: SupabaseIdentity,
    input: {
      academyId: string;
      courseId: string;
      nodeKey: string;
      localId: string | null;
      action?: "MATCH" | "KEEP_DELETED" | "ADD";
      expectedHash: string;
    },
  ) {
    const actor = await this.access.requirePermission(
      identity.authUserId,
      input.academyId,
      "curriculum.manage",
    );
    const requestHash = createHash("sha256")
      .update(canonicalJson({ legacyIdentity: input }))
      .digest("hex");
    const requestKey = `${requestHash.slice(0, 8)}-${requestHash.slice(8, 12)}-${requestHash.slice(12, 16)}-${requestHash.slice(16, 20)}-${requestHash.slice(20, 32)}`;
    await this.db.$transaction(
      async (tx) => {
        const state = await tx.courseSyncState.findFirst({
          where: {
            courseId: input.courseId,
            course: { academyId: input.academyId },
          },
          select: { libraryCourseId: true },
        });
        if (!state) throw deny();
        await tx.$queryRaw`SELECT id FROM courses WHERE id=${state.libraryCourseId}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM courses WHERE id=${input.courseId}::uuid FOR UPDATE`;
        const receipt = await tx.librarySyncResolutionReceipt.findUnique({
          where: {
            copyCourseId_requestKey: {
              copyCourseId: input.courseId,
              requestKey,
            },
          },
        });
        if (receipt) {
          if (receipt.requestHash !== requestHash) throw deny();
          return;
        }
        const recordDecision = () =>
          tx.librarySyncResolutionReceipt.create({
            data: {
              copyCourseId: input.courseId,
              requestKey,
              requestHash,
              actorUserId: actor.userId,
              groupId: input.nodeKey,
              result: { legacyIdentity: true },
            },
          });
        const report = await this.inspect(tx, input.courseId, input.academyId);
        if (report.hash !== input.expectedHash) throw deny();
        const node = report.nodes.find((n) => n.nodeKey === input.nodeKey);
        if (!node || !report.releaseId) throw deny();
        if (input.action === "ADD" && input.localId !== null) throw deny();
        if (
          input.localId &&
          !report.candidates.some(
            (c) =>
              c.id === input.localId &&
              c.kind === node.kind &&
              c.materialType === node.materialType,
          )
        )
          throw deny();
        if (input.action === "ADD") {
          await tx.librarySyncLink.deleteMany({
            where: { copyCourseId: input.courseId, nodeKey: input.nodeKey },
          });
          await tx.librarySyncBase.deleteMany({
            where: { copyCourseId: input.courseId, nodeKey: input.nodeKey },
          });
          await this.queue(tx, input.courseId);
          await this.audit.write(tx, {
            actorUserId: actor.userId,
            academyId: input.academyId,
            action: "content.library_sync.link_resolved",
            targetType: "Course",
            targetId: input.courseId,
            after: { nodeKey: input.nodeKey, action: "ADD" },
          });
          await recordDecision();
          return;
        }
        await tx.librarySyncLink.update({
          where: {
            copyCourseId_nodeKey: {
              copyCourseId: input.courseId,
              nodeKey: input.nodeKey,
            },
          },
          data: {
            localId: input.localId,
            state: input.localId ? "LINKED" : "LOCAL_DELETED",
            meta: { legacyUnmatched: false },
            evidence: "MANUAL",
          },
        });
        if (input.localId)
          await this.alignItems(
            tx,
            input.courseId,
            input.nodeKey,
            input.localId,
            report.releaseId,
          );
        const sourceNodes = await this.seedBases(
          tx,
          input.courseId,
          state.libraryCourseId,
          input.nodeKey,
        );
        // A deleted node's incoming revision has been explicitly acknowledged.
        if (!input.localId) {
          const excluded = new Set([input.nodeKey]);
          let grew = true;
          while (grew) {
            grew = false;
            for (const n of sourceNodes)
              if (
                n.parentKey &&
                excluded.has(n.parentKey) &&
                !excluded.has(n.nodeKey)
              ) {
                excluded.add(n.nodeKey);
                grew = true;
              }
          }
          const rows = sourceNodes
            .filter((n) => excluded.has(n.nodeKey))
            .map((n) => ({
              key: n.nodeKey,
              meta: {
                legacyUnmatched: false,
                legacyDeletedBase: {
                  nodeKey: n.nodeKey,
                  kind: n.kind,
                  materialType: n.materialType,
                  parentKey: n.parentKey,
                  ordinal: n.ordinal,
                  unitHashes: n.unitHashes,
                },
              },
            }));
          await tx.$executeRaw`UPDATE library_sync_links k SET state='LOCAL_DELETED',local_id=NULL,meta=v.meta,updated_at=now() FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS v(key uuid,meta jsonb) WHERE k.copy_course_id=${input.courseId}::uuid AND k.node_key=v.key`;
          await tx.librarySyncBase.deleteMany({
            where: {
              copyCourseId: input.courseId,
              nodeKey: { in: [...excluded] },
            },
          });
        }
        await this.queue(tx, input.courseId);
        await this.audit.write(tx, {
          actorUserId: actor.userId,
          academyId: input.academyId,
          action: "content.library_sync.link_resolved",
          targetType: "Course",
          targetId: input.courseId,
          after: { nodeKey: input.nodeKey, localId: input.localId },
        });
        await recordDecision();
      },
      { timeout: 60_000 },
    );
    this.jobs.requestDrain();
    return { resolved: true };
  }

  private async inspect(tx: Tx, copyId: string, academyId?: string) {
    const [copy] = await tx.$queryRaw<
      Array<{
        id: string;
        academyId: string;
        contentRevision: number;
        sourceCourseId: string;
        linked: boolean;
        releaseId: string | null;
        releaseNumber: number | null;
      }>
    >`
      SELECT cp.id,cp.academy_id AS "academyId",cp.content_revision AS "contentRevision",m.id AS "sourceCourseId",
        EXISTS(SELECT 1 FROM course_sync_states s WHERE s.course_id=cp.id) AS linked,r.id AS "releaseId",r.number AS "releaseNumber"
      FROM courses cp JOIN academies a ON a.id=cp.academy_id AND a.kind='ACADEMY'
      JOIN courses m ON m.id=cp.source_course_id JOIN academies lib ON lib.id=m.academy_id AND lib.kind='LIBRARY' AND lib.organization_id=a.organization_id
      LEFT JOIN LATERAL (SELECT id,number FROM library_releases WHERE library_course_id=m.id ORDER BY number DESC LIMIT 1) r ON true
      WHERE cp.id=${copyId}::uuid AND (${academyId ?? null}::uuid IS NULL OR cp.academy_id=${academyId ?? null}::uuid)`;
    if (!copy) throw deny();
    const master = { id: copy.sourceCourseId };
    const release = copy.releaseId
      ? { id: copy.releaseId, number: copy.releaseNumber! }
      : null;
    const [projection, sourceRows] = await Promise.all([
      readCourseProjection(tx, copyId, { mode: "digest" }),
      release
        ? tx.libraryReleaseNode.findMany({
            where: { releaseId: release.id },
            orderBy: [{ ordinal: "asc" }, { nodeKey: "asc" }],
          })
        : Promise.resolve([]),
    ]);
    const mine = projectNodes(projection!, copyKeyMap(projection!, master.id));
    const source = sourceRows.map(storedReleaseView);
    const names = await readValues(
      tx,
      source.flatMap((n) =>
        Object.entries(n.unitHashes)
          .filter(([k]) => k.endsWith(".title"))
          .map(([, v]) => v),
      ),
    );
    const used = new Set(
      projection!.links.filter((l) => l.localId).map((l) => l.localId),
    );
    const linkOf = new Map(projection!.links.map((l) => [l.nodeKey, l]));
    const mineByKey = new Map(mine.map((n) => [n.key, n]));
    const localPath = (key: string): string => {
      const parts: string[] = [];
      for (
        let n = mineByKey.get(key);
        n && n.kind !== "COURSE";
        n = n.parentKey ? mineByKey.get(n.parentKey) : undefined
      ) {
        const title =
          n.units[
            n.kind === "MODULE"
              ? "module.title"
              : n.kind === "LECTURE"
                ? "lecture.title"
                : "material.title"
          ];
        parts.unshift(String(title ?? ""));
      }
      return parts.join(" › ");
    };
    const nodes: Candidate[] = source
      .filter(
        (n) =>
          n.kind !== "COURSE" &&
          (!copy.linked || linkOf.get(n.key)?.meta?.legacyUnmatched),
      )
      .sort(
        (a, b) =>
          ({ COURSE: 0, MODULE: 1, LECTURE: 2, MATERIAL: 3 })[a.kind] -
          { COURSE: 0, MODULE: 1, LECTURE: 2, MATERIAL: 3 }[b.kind],
      )
      .map((n) => {
        const titleKey =
          n.kind === "MODULE"
            ? "module.title"
            : n.kind === "LECTURE"
              ? "lecture.title"
              : "material.title";
        return {
          nodeKey: n.key,
          kind: n.kind,
          materialType: n.materialType,
          title: String(names.get(n.unitHashes[titleKey]!) ?? ""),
          localId: null,
        };
      });
    const hash = createHash("sha256")
      .update(
        canonicalJson({
          release: release?.id ?? null,
          revision: copy.contentRevision,
          nodes: mine.map((n) => ({
            key: n.key,
            id: n.localId,
            parent: n.parentKey,
            ordinal: n.ordinal,
            visible: n.isVisible,
            hashes: hashUnits(n.units),
          })),
          links: projection!.links,
        }),
      )
      .digest("hex");
    return {
      academyId: copy.academyId,
      libraryCourseId: master.id,
      releaseId: release?.id ?? null,
      releaseNumber: release?.number ?? 0,
      hash,
      nodes,
      candidates: mine
        .filter((m) => m.kind !== "COURSE" && !used.has(m.localId))
        .map((m) => ({
          id: m.localId,
          title: localPath(m.key),
          kind: m.kind,
          materialType: m.materialType,
        })),
    };
  }

  private async seedBases(
    tx: Tx,
    copyId: string,
    masterId: string,
    onlyNode?: string,
  ) {
    const state = await tx.courseSyncState.findUniqueOrThrow({
      where: { courseId: copyId },
    });
    const [projection, source] = await Promise.all([
      readCourseProjection(tx, copyId, { mode: "digest" }),
      tx.libraryReleaseNode.findMany({
        where: { releaseId: state.targetReleaseId! },
      }),
    ]);
    const mine = projectNodes(projection!, copyKeyMap(projection!, masterId));
    const rows = new Map<
      string,
      {
        copyCourseId: string;
        nodeKey: string;
        unitKey: string;
        baseState: "UNKNOWN";
        baseHash: null;
      }
    >();
    const add = (key: string, unit: string) => {
      if (!onlyNode || key === onlyNode)
        rows.set(key + "\0" + unit, {
          copyCourseId: copyId,
          nodeKey: key,
          unitKey: unit,
          baseState: "UNKNOWN",
          baseHash: null,
        });
    };
    for (const n of source) {
      for (const key of Object.keys(n.unitHashes as object))
        if (!key.startsWith("@")) add(n.nodeKey, key);
      add(n.nodeKey, "@presence");
      add(n.nodeKey, "@parent");
      add(n.nodeKey, "@order");
    }
    for (const n of mine) {
      if (n.key.startsWith("local:")) continue;
      for (const key of Object.keys(n.units))
        if (!key.startsWith("@")) add(n.key, key);
    }
    await tx.librarySyncBase.deleteMany({
      where: {
        copyCourseId: copyId,
        ...(onlyNode ? { nodeKey: onlyNode } : {}),
      },
    });
    if (rows.size)
      await tx.librarySyncBase.createMany({ data: [...rows.values()] });
    return source;
  }

  private async alignItems(
    tx: Tx,
    copyId: string,
    nodeKey: string,
    localId: string,
    releaseId: string,
  ) {
    const [node, projection] = await Promise.all([
      tx.libraryReleaseNode.findUniqueOrThrow({
        where: { releaseId_nodeKey: { releaseId, nodeKey } },
      }),
      readCourseProjection(tx, copyId, { mode: "digest" }),
    ]);
    const state = await tx.courseSyncState.findUniqueOrThrow({
      where: { courseId: copyId },
      select: { libraryCourseId: true },
    });
    const local = projectNodes(
      projection!,
      copyKeyMap(projection!, state.libraryCourseId),
    ).find((n) => n.localId === localId)!;
    const src = node.unitHashes as Record<string, string>;
    const ours = hashUnits(local.units);
    const changesFor = (prefix: string) => {
      const changes: Array<{ old: string; next: string }> = [];
      const source = Object.entries(src).filter(([k]) => k.startsWith(prefix));
      const dest = Object.entries(ours).filter(([k]) => k.startsWith(prefix));
      for (const [k, h] of source) {
        const matches = dest.filter(([, hash]) => hash === h);
        if (
          matches.length === 1 &&
          source.filter(([, hash]) => hash === h).length === 1 &&
          !dest.some(([dk]) => dk === k)
        )
          changes.push({
            old: matches[0]![0].slice(prefix.length),
            next: k.slice(prefix.length),
          });
      }
      return JSON.stringify(changes);
    };
    const cases = changesFor("exercise.testCase:"),
      hints = changesFor("exercise.hint:"),
      solutions = changesFor("exercise.solution:");
    if (cases !== "[]" || hints !== "[]" || solutions !== "[]")
      await tx.$executeRaw`
      WITH cases AS (UPDATE exercise_test_cases t SET sync_key=v.next FROM jsonb_to_recordset(${cases}::jsonb) AS v(old uuid,next uuid) WHERE t.exercise_material_id=${localId}::uuid AND t.sync_key=v.old RETURNING t.id),
      hints AS (UPDATE exercise_hints t SET sync_key=v.next FROM jsonb_to_recordset(${hints}::jsonb) AS v(old uuid,next uuid) WHERE t.exercise_material_id=${localId}::uuid AND t.sync_key=v.old RETURNING t.id)
      UPDATE programming_exercise_solutions t SET sync_key=v.next FROM jsonb_to_recordset(${solutions}::jsonb) AS v(old uuid,next uuid) WHERE t.material_id=${localId}::uuid AND t.sync_key=v.old`;
    const options: Record<string, string> = {};
    const prefix = "mc.option:";
    for (const [k, h] of Object.entries(src).filter(([k]) =>
      k.startsWith(prefix),
    )) {
      const matches = Object.entries(ours).filter(
        ([dk, dh]) => dk.startsWith(prefix) && dh === h,
      );
      if (
        matches.length === 1 &&
        Object.entries(src).filter(
          ([sk, sh]) => sk.startsWith(prefix) && sh === h,
        ).length === 1
      )
        options[k.slice(prefix.length)] = matches[0]![0]
          .slice(prefix.length)
          .replace(/^local:/, "");
    }
    if (Object.keys(options).length)
      await tx.librarySyncLink.update({
        where: { copyCourseId_nodeKey: { copyCourseId: copyId, nodeKey } },
        data: { meta: { legacyUnmatched: false, optionMap: options } },
      });
  }

  private async queue(tx: Tx, copyId: string) {
    await tx.$executeRaw`WITH latest AS (SELECT r.id,r.number FROM library_releases r JOIN course_sync_states s ON s.library_course_id=r.library_course_id WHERE s.course_id=${copyId}::uuid ORDER BY r.number DESC LIMIT 1)
      UPDATE course_sync_states s SET target_release_id=r.id,target_release_number=r.number,last_synced_content_revision=NULL,status=CASE WHEN paused_at IS NULL THEN 'PENDING'::"LibrarySyncStatus" ELSE 'PAUSED'::"LibrarySyncStatus" END FROM latest r WHERE s.course_id=${copyId}::uuid`;
    await tx.$executeRaw`INSERT INTO library_sync_jobs(id,copy_course_id,target_release_id,target_release_number,status,next_attempt_at)
      SELECT gen_random_uuid(),course_id,target_release_id,target_release_number,'PENDING',now() FROM course_sync_states WHERE course_id=${copyId}::uuid AND paused_at IS NULL
      ON CONFLICT(copy_course_id) WHERE status='PENDING' DO UPDATE SET target_release_id=EXCLUDED.target_release_id,target_release_number=EXCLUDED.target_release_number,next_attempt_at=now()`;
  }
}
