import { createHash, randomBytes, randomUUID } from "node:crypto";

import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import {
  IMPORT_PREVIEW_TTL_MS,
  applyAcademyFacts,
  canCommitPreview,
  importRowSchema,
  judgeImportRow,
  mapHeaderRow,
  requiredImportColumns,
  summarizeRows,
  type CommitImportInput,
  type ImportPreview,
  type ImportResult,
  type ImportResultRow,
  type ImportRow,
} from "@cove/shared";
import { z } from "zod";

import { AuditService } from "../academies/audit.service.js";
import { RateLimitService } from "../academies/rate-limit.service.js";
import {
  hashInvitationToken,
  normalizeEmail,
} from "../academies/academy-invitation.service.js";
import type { SupabaseIdentity } from "../auth/auth.types.js";
import { AppException } from "../common/app-exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { InvitationDeliveryService } from "./invitation-delivery.service.js";
import { ManagerScopeService, type ManagerActor } from "./manager-scope.service.js";
import { bumpPeopleRevision } from "./people-revision.js";
import { WorkbookError, readWorkbook } from "./workbook-reader.js";

/**
 * §7.5 — the deep module behind member import.
 *
 * It owns parsing, normalization, preview lifetime, duplicate detection,
 * conflict rules, authorization, the atomic commit, idempotency, results, and
 * the audit summary. The browser never orchestrates row-by-row writes, which is
 * the property that makes an interrupted import a non-event rather than a
 * half-imported academy.
 *
 * The shape is preview-then-commit, and the two halves are deliberately
 * asymmetric.
 *
 * *Preview is cheap and repeatable.* It parses, judges, and stores. It writes
 * nothing to the academy, so a manager can upload the wrong file, look, and
 * upload another without consequence.
 *
 * *Commit is expensive and happens once.* It re-checks authorization, expiry,
 * the academy revision, and every row — because the preview may have sat on a
 * screen for twenty minutes while somebody else invited half of it — and then
 * writes everything in one transaction. Delivery happens after, outside.
 *
 * The stored preview is the source of truth for what commits. Re-parsing at
 * commit time would let a deployment between the two requests apply different
 * normalization to rows a manager already approved, which is exactly the class
 * of surprise the preview exists to eliminate.
 *
 * See §11 of the manager control tower and scalable people operations design.
 */
@Injectable()
export class PeopleImportService {
  private readonly logger = new Logger(PeopleImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: ManagerScopeService,
    private readonly audit: AuditService,
    private readonly rateLimit: RateLimitService,
    private readonly delivery: InvitationDeliveryService,
  ) {}

  /* ------------------------------------------------------------- preview */

  /**
   * Parse a workbook and store what it would do.
   *
   * The row cap, the cell cap, the sheet cap, and the format sniff all happen
   * in the reader before a single row is judged, so a hostile file is refused
   * on its shape rather than on its hundredth row.
   */
  async createPreview(
    identity: SupabaseIdentity,
    input: { academyId: string; filename: string; bytes: Buffer },
  ): Promise<ImportPreview> {
    const actor = await this.scopes.requireManager(
      identity,
      input.academyId,
      "academy.members.manage",
    );

    // §17 — uploads are rate limited per academy, because parsing is the most
    // expensive unauthenticated-shaped work this API does on a manager's behalf.
    this.rateLimit.assert(`import-preview:${input.academyId}`, 10, 60_000);

    let grid: string[][];
    try {
      grid = readWorkbook({ bytes: input.bytes, filename: input.filename }).rows;
    } catch (error) {
      if (error instanceof WorkbookError) {
        throw new AppException(
          "IMPORT_FILE_REJECTED",
          HttpStatus.UNPROCESSABLE_ENTITY,
          error.code,
        );
      }
      throw error;
    }

    const [header, ...dataRows] = grid;
    const columns = mapHeaderRow(header ?? []);
    for (const required of requiredImportColumns) {
      if (!columns.includes(required)) {
        throw new AppException(
          "IMPORT_FILE_REJECTED",
          HttpStatus.UNPROCESSABLE_ENTITY,
          "missing_required_column",
        );
      }
    }

    const at = (row: string[], column: (typeof columns)[number]) => {
      const index = columns.indexOf(column);
      return index >= 0 ? (row[index] ?? "") : "";
    };

    const judged = dataRows.map((row, offset) =>
      judgeImportRow({
        // Two-based and counting the header, so the number matches what the
        // manager sees in the left margin of their spreadsheet.
        rowNumber: offset + 2,
        email: at(row, "email"),
        role: at(row, "role"),
        displayName: at(row, "display_name"),
        sendInvitation: at(row, "send_invitation"),
      }),
    );

    const emails = [
      ...new Set(
        judged
          .map((row) => row.normalized.email)
          .filter((email): email is string => email !== null),
      ),
    ];
    const facts = await this.academyFacts(input.academyId, emails);
    const rows = applyAcademyFacts(judged, facts);
    const summary = summarizeRows(rows);

    const academy = await this.prisma.academy.findUniqueOrThrow({
      where: { id: input.academyId },
      select: { peopleRevision: true },
    });

    const session = await this.prisma.peopleImportSession.create({
      data: {
        academyId: input.academyId,
        actorUserId: actor.userId,
        originalFilename: input.filename.slice(0, 255),
        checksumSha256: createHash("sha256").update(input.bytes).digest("hex"),
        status: "PREVIEW_READY",
        totalRows: summary.total,
        readyRows: summary.ready,
        warningRows: summary.warning,
        errorRows: summary.error,
        preview: rows,
        capturedPeopleRevision: academy.peopleRevision,
        expiresAt: new Date(Date.now() + IMPORT_PREVIEW_TTL_MS),
        // Generated here rather than accepted from the browser. The commit's
        // key is the session, and a client-chosen one would let two managers
        // collide on a value one of them picked.
        idempotencyKey: randomUUID(),
      },
    });

    // §15 — the named operation and its counts, never a row or an address.
    this.logger.log(
      `import preview academy=${input.academyId} rows=${summary.total} ` +
        `ready=${summary.ready} warning=${summary.warning} error=${summary.error}`,
    );

    return toPreview(session, rows);
  }

  /** An existing preview, or the fact that it has expired. */
  async getPreview(
    identity: SupabaseIdentity,
    input: { academyId: string; sessionId: string },
  ): Promise<ImportPreview> {
    await this.scopes.requireManager(
      identity,
      input.academyId,
      "academy.members.manage",
    );
    const session = await this.requireSession(input);
    return toPreview(session, readRows(session.preview));
  }

  /* -------------------------------------------------------------- commit */

  /**
   * Create every invited membership, in one transaction, once.
   *
   * The order of the checks is the design. Authorization, then idempotency,
   * then expiry, then the revision, then the rows — each one cheaper to fail
   * than the next, and each one a different message to the manager.
   *
   * `status: COMMITTING` is claimed with a conditional update before any write.
   * That is what makes two tabs pressing Commit produce one import: the second
   * finds the session no longer `PREVIEW_READY` and returns the first one's
   * result instead of running again.
   */
  async commit(
    identity: SupabaseIdentity,
    input: CommitImportInput,
  ): Promise<ImportResult> {
    const actor = await this.scopes.requireManager(
      identity,
      input.academyId,
      "academy.members.manage",
    );
    this.rateLimit.assert(`import-commit:${input.academyId}`, 5, 60_000);

    const session = await this.requireSession(input);

    // Idempotent replay. A retry after a lost response must not invite two
    // hundred people twice — §14 says the same key returns the original result.
    if (session.status === "COMPLETED") {
      return toResult(session);
    }
    if (session.status === "COMMITTING") {
      throw new AppException("IMPORT_IN_PROGRESS", HttpStatus.CONFLICT);
    }
    if (session.status !== "PREVIEW_READY") {
      throw new AppException("IMPORT_PREVIEW_EXPIRED", HttpStatus.GONE);
    }
    if (session.expiresAt <= new Date()) {
      await this.prisma.peopleImportSession.update({
        where: { id: session.id },
        data: { status: "EXPIRED" },
      });
      throw new AppException("IMPORT_PREVIEW_EXPIRED", HttpStatus.GONE);
    }

    const rows = readRows(session.preview);
    if (
      !canCommitPreview({
        rows,
        warningsAcknowledged: input.acknowledgeWarnings,
      })
    ) {
      throw new AppException(
        "IMPORT_NOT_COMMITTABLE",
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    // §8.1 — the roster must not have moved since the manager looked. Checked
    // against what the *browser* saw, so two tabs cannot each believe they are
    // current.
    const academy = await this.prisma.academy.findUniqueOrThrow({
      where: { id: input.academyId },
      select: { peopleRevision: true },
    });
    if (
      academy.peopleRevision !== session.capturedPeopleRevision ||
      academy.peopleRevision !== input.peopleRevision
    ) {
      throw new AppException("PEOPLE_REVISION_CONFLICT", HttpStatus.CONFLICT);
    }

    // Claim the session. `PREVIEW_READY` in the where clause is the lock: the
    // loser of a race updates zero rows and is told the import is under way.
    const claimed = await this.prisma.peopleImportSession.updateMany({
      where: { id: session.id, status: "PREVIEW_READY" },
      data: { status: "COMMITTING" },
    });
    if (claimed.count === 0) {
      throw new AppException("IMPORT_IN_PROGRESS", HttpStatus.CONFLICT);
    }

    try {
      const outcome = await this.writeInvitations({
        actor,
        academyId: input.academyId,
        sessionId: session.id,
        rows,
        expectedRevision: academy.peopleRevision,
      });

      const completed = await this.prisma.peopleImportSession.update({
        where: { id: session.id },
        data: {
          status: "COMPLETED",
          committedAt: new Date(),
          result: outcome.rows,
        },
      });

      // §12 — delivery is intentionally outside the transaction, and after it.
      // A provider outage must not roll back memberships that were created.
      for (const pending of outcome.pendingDeliveries) {
        await this.delivery.queueForInvitation(pending);
      }

      this.logger.log(
        `import commit academy=${input.academyId} invited=${outcome.invited} ` +
          `skipped=${outcome.skipped}`,
      );

      return toResult(completed);
    } catch (error) {
      // The transaction rolled back, so the academy is untouched. The session
      // is marked failed rather than left COMMITTING, which would strand it.
      await this.prisma.peopleImportSession.update({
        where: { id: session.id },
        data: {
          status: "FAILED",
          failureCode: error instanceof AppException ? error.code : "unknown",
        },
      });
      throw error;
    }
  }

  /** A committed session's row-level outcomes, for the CSV export. */
  async result(
    identity: SupabaseIdentity,
    input: { academyId: string; sessionId: string },
  ): Promise<ImportResult> {
    await this.scopes.requireManager(
      identity,
      input.academyId,
      "academy.members.manage",
    );
    return toResult(await this.requireSession(input));
  }

  /* ------------------------------------------------------------ internals */

  /**
   * Every invitation, in one transaction.
   *
   * The re-validation inside the transaction is not belt and braces. The
   * preview was taken at some earlier moment, and between then and now somebody
   * may have accepted an invitation or been added by hand — so membership and
   * pending-invitation state is read again *here*, holding the same transaction
   * that will write, and a row that has become impossible is skipped with a
   * code rather than failing the whole import.
   *
   * The revision guard at the end is the serialization point: it re-reads the
   * academy row inside the transaction and refuses if it moved, which closes
   * the window between the check above and this write.
   */
  private async writeInvitations(input: {
    actor: ManagerActor;
    academyId: string;
    sessionId: string;
    rows: ImportRow[];
    expectedRevision: number;
  }): Promise<{
    rows: ImportResultRow[];
    invited: number;
    skipped: number;
    pendingDeliveries: {
      invitationId: string;
      academyId: string;
      email: string;
      token: string;
    }[];
  }> {
    return this.prisma.$transaction(async (transaction) => {
      // Lock the academy row first. Every people mutation bumps its revision,
      // so taking it here serializes this import against concurrent bulk
      // operations and single invitations rather than merely detecting them.
      await transaction.$queryRaw`
        SELECT id FROM academies WHERE id = ${input.academyId}::uuid FOR UPDATE
      `;

      const current = await transaction.academy.findUniqueOrThrow({
        where: { id: input.academyId },
        select: { peopleRevision: true },
      });
      if (current.peopleRevision !== input.expectedRevision) {
        throw new AppException("PEOPLE_REVISION_CONFLICT", HttpStatus.CONFLICT);
      }

      const emails = input.rows
        .map((row) => row.normalized.email)
        .filter((email): email is string => email !== null);
      const facts = await this.academyFacts(input.academyId, emails, transaction);

      const results: ImportResultRow[] = [];
      const pendingDeliveries: {
        invitationId: string;
        academyId: string;
        email: string;
        token: string;
      }[] = [];
      let invited = 0;
      let skipped = 0;

      for (const row of input.rows) {
        const email = row.normalized.email;
        const role = row.normalized.role;
        if (!email || !role) {
          // Unreachable for a committable preview, and handled anyway: a row
          // that cannot name a person must never become one.
          results.push({
            rowNumber: row.rowNumber,
            email: email ?? "",
            outcome: "failed",
            code: "row_invalid",
          });
          continue;
        }

        if (facts.existingMemberEmails.has(email)) {
          // Someone joined between preview and commit. Import is create-only —
          // §4 — so this is a skip with a reason, never a silent update.
          results.push({
            rowNumber: row.rowNumber,
            email,
            outcome: "skipped",
            code: "membership_exists",
          });
          skipped += 1;
          continue;
        }
        if (facts.pendingInvitationEmails.has(email)) {
          results.push({
            rowNumber: row.rowNumber,
            email,
            outcome: "skipped",
            code: "invitation_pending",
          });
          skipped += 1;
          continue;
        }

        const token = randomBytes(32).toString("base64url");
        const invitation = await transaction.academyInvitation.create({
          data: {
            academyId: input.academyId,
            email,
            role,
            displayNameHint: row.normalized.displayName,
            tokenHash: hashInvitationToken(token),
            status: "PENDING",
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000),
            invitedByUserId: input.actor.userId,
          },
        });

        // Added to the in-transaction view so a file containing the same
        // address twice — which the duplicate rule should have caught, but
        // which a hand-edited preview could still reach — cannot create two.
        facts.pendingInvitationEmails.add(email);

        if (row.normalized.sendInvitation) {
          pendingDeliveries.push({
            invitationId: invitation.id,
            academyId: input.academyId,
            email,
            token,
          });
        }
        results.push({
          rowNumber: row.rowNumber,
          email,
          outcome: "invited",
          code: row.normalized.sendInvitation ? "invited" : "invited_no_email",
        });
        invited += 1;
      }

      // §12 — one operation summary, and the affected records, inside the same
      // transaction. An audit trail written afterwards is an audit trail that
      // disagrees with the database whenever the process dies in between.
      await this.audit.write(transaction, {
        actorUserId: input.actor.userId,
        academyId: input.academyId,
        action: "academy.people.imported",
        targetType: "PeopleImportSession",
        targetId: input.sessionId,
        after: { invited, skipped, total: input.rows.length },
      });

      await bumpPeopleRevision(transaction, input.academyId);

      return { rows: results, invited, skipped, pendingDeliveries };
    });
  }

  /**
   * What the academy already knows about these addresses.
   *
   * Two `IN` queries rather than one per row: five hundred rows would otherwise
   * be a thousand round trips inside a transaction holding a lock on the
   * academy.
   */
  private async academyFacts(
    academyId: string,
    emails: string[],
    client: {
      user: PrismaService["user"];
      academyInvitation: PrismaService["academyInvitation"];
    } = this.prisma,
  ): Promise<{
    existingMemberEmails: Set<string>;
    pendingInvitationEmails: Set<string>;
  }> {
    if (emails.length === 0) {
      return {
        existingMemberEmails: new Set(),
        pendingInvitationEmails: new Set(),
      };
    }

    const [members, invitations] = await Promise.all([
      client.user.findMany({
        where: {
          email: { in: emails },
          memberships: { some: { academyId } },
        },
        select: { email: true },
      }),
      client.academyInvitation.findMany({
        where: {
          academyId,
          email: { in: emails },
          status: "PENDING",
          expiresAt: { gt: new Date() },
        },
        select: { email: true },
      }),
    ]);

    return {
      existingMemberEmails: new Set(
        members
          .map((member) => member.email)
          .filter((email): email is string => email !== null)
          .map(normalizeEmail),
      ),
      pendingInvitationEmails: new Set(
        invitations.map((invitation) => normalizeEmail(invitation.email)),
      ),
    };
  }

  /** The session, scoped to the academy that asked for it. */
  private async requireSession(input: {
    academyId: string;
    sessionId: string;
  }) {
    const session = await this.prisma.peopleImportSession.findUnique({
      where: { id: input.sessionId },
    });
    // Cross-academy ids fail closed, and with the same code as a missing one:
    // a manager must not be able to confirm another academy's session exists.
    if (!session || session.academyId !== input.academyId) {
      throw new AppException("IMPORT_SESSION_NOT_FOUND", HttpStatus.NOT_FOUND);
    }
    return session;
  }
}

/* ---------------------------------------------------------------- mapping */

/**
 * The stored preview, read back defensively.
 *
 * The column is JSON, which the type system cannot vouch for across a
 * deployment that changed the row shape. Parsing rather than casting means a
 * session written by an older version fails loudly at commit rather than
 * quietly inviting the wrong people.
 */
export function readRows(value: unknown): ImportRow[] {
  const parsed = z.array(importRowSchema).safeParse(value);
  if (!parsed.success) {
    throw new AppException(
      "IMPORT_PREVIEW_EXPIRED",
      HttpStatus.GONE,
      "preview_unreadable",
    );
  }
  return parsed.data;
}

function toPreview(
  session: {
    id: string;
    status: string;
    originalFilename: string;
    totalRows: number;
    readyRows: number;
    warningRows: number;
    errorRows: number;
    capturedPeopleRevision: number;
    expiresAt: Date;
    createdAt: Date;
  },
  rows: ImportRow[],
): ImportPreview {
  return {
    sessionId: session.id,
    status: session.status as ImportPreview["status"],
    originalFilename: session.originalFilename,
    total: session.totalRows,
    ready: session.readyRows,
    warning: session.warningRows,
    error: session.errorRows,
    rows,
    peopleRevision: session.capturedPeopleRevision,
    expiresAt: session.expiresAt.toISOString(),
    createdAt: session.createdAt.toISOString(),
  };
}

function toResult(session: {
  id: string;
  status: string;
  result: unknown;
  committedAt: Date | null;
}): ImportResult {
  const rows =
    z.array(z.any()).safeParse(session.result).success && Array.isArray(session.result)
      ? (session.result as ImportResultRow[])
      : [];
  return {
    sessionId: session.id,
    status: session.status as ImportResult["status"],
    invited: rows.filter((row) => row.outcome === "invited").length,
    skipped: rows.filter((row) => row.outcome === "skipped").length,
    failed: rows.filter((row) => row.outcome === "failed").length,
    rows,
    committedAt: session.committedAt?.toISOString() ?? null,
  };
}
