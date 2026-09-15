import { Injectable, Logger } from "@nestjs/common";
import { toSharedDocumentText } from "@cove/shared";

import { PrismaService } from "../database/prisma.service.js";

/**
 * The one place a draft's text is written.
 *
 * Two writers used to own `ExerciseDraft.code` independently: the HTTP
 * autosave, and the collaboration document's flush. Neither consulted the
 * other, so an unwatched edit could leave the CRDT stale, and a later
 * collaboration flush could overwrite a save that was newer than anything the
 * document had ever seen. Both now come through here, and here decides which
 * authority owns the draft at the moment of the write.
 *
 * This lives in its own module because both callers must be able to reach it:
 * monitoring already imports the learning module, so the coordination could
 * not live in either one without making the graph circular.
 */

export type DraftSaveOutcome =
  | { outcome: "SAVED"; updatedAt: Date }
  /**
   * The buffer was written against a revision the server has since passed, and
   * its text disagrees with what is stored. The stored code travels back with
   * the refusal so the caller can put the disagreement in front of the person
   * rather than discarding one side of it.
   */
  | { outcome: "CONFLICT"; updatedAt: Date; code: string };

/**
 * A live collaboration session, as this boundary needs to see it.
 *
 * Registered rather than injected so the dependency points one way: the
 * coordinator knows there may be an authority, and nothing about Yjs, sockets,
 * or rooms.
 *
 * Note what is deliberately absent: there is no way to *write* a snapshot into
 * a live document. A plain snapshot is a picture of a buffer at some past
 * moment and carries no information about what the other person did since, so
 * applying one can only replace their work. While a document is live it is the
 * authority, and a snapshot that disagrees with it is refused.
 */
export type LiveDraftAuthority = {
  /** Whether a live document currently owns this draft's text. */
  owns: (draftId: string) => boolean;
  /** What that document currently holds. */
  readCode: (draftId: string) => Promise<string>;
  /** Writes it to Postgres now rather than on its debounce. */
  persist: (draftId: string) => Promise<{ code: string; updatedAt: Date } | null>;
  /** Drops a document whose draft no longer exists, without flushing it. */
  forget: (draftId: string) => void;
};

export type DraftSaveInput = {
  userId: string;
  materialId: string;
  sourceMaterialId: string;
  courseId: string;
  code: string;
  /**
   * The `updatedAt` the buffer was edited from, or null when the caller has
   * never seen a stored revision.
   *
   * Null is not a way past the staleness check. A client that loaded a draft
   * always knows its revision, so null against an existing draft means the
   * caller cannot show that it is not about to replace somebody else's work —
   * and it is refused on exactly the same terms as an outdated one.
   */
  baseUpdatedAt: Date | null;
};

/** A draft write that lost a race is retried against what it found. */
const maxAttempts = 3;

@Injectable()
export class DraftCoordinator {
  private readonly logger = new Logger(DraftCoordinator.name);
  private authority: LiveDraftAuthority | null = null;

  constructor(private readonly prisma: PrismaService) {}

  register(authority: LiveDraftAuthority): () => void {
    this.authority = authority;
    return () => {
      if (this.authority === authority) this.authority = null;
    };
  }

  async save(input: DraftSaveInput): Promise<DraftSaveOutcome> {
    // Canonical before it is stored, so the next editor to open it builds an
    // LF model and every offset it exchanges describes the same string.
    const code = toSharedDocumentText(input.code);

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const existing = await this.prisma.exerciseDraft.findUnique({
        where: {
          userId_materialId: {
            userId: input.userId,
            materialId: input.materialId,
          },
        },
        select: { id: true, code: true, updatedAt: true },
      });

      if (!existing) {
        const created = await this.createFirstDraft(input, code);
        // Lost the race to another tab creating the same draft. Go round
        // again; this time the row is there and the compare-and-swap below
        // decides the outcome.
        if (created === null) continue;
        return { outcome: "SAVED", updatedAt: created };
      }

      /**
       * A live session owns the text.
       *
       * The document is the authority while it exists, and a snapshot is a
       * picture of a buffer taken at some earlier moment. One that agrees with
       * the document is simply this client asking for durability, and gets it.
       * One that disagrees is a replacement of live work — the other person's,
       * or this one's own from before an edit it has not caught up with — and
       * is refused with what the document holds so nothing is lost.
       */
      if (this.authority?.owns(existing.id)) {
        const live = await this.authority.readCode(existing.id);
        if (live !== code) {
          this.logger.warn(
            `refused a snapshot that disagreed with a live document for material ${input.materialId}`,
          );
          return {
            outcome: "CONFLICT",
            updatedAt: existing.updatedAt,
            code: live,
          };
        }
        // Reported saved only once it is actually in Postgres: the document
        // writes on a debounce, and saying "saved" ahead of that would be a
        // claim about durability this call had not yet earned.
        const durable = await this.authority.persist(existing.id);
        if (!durable) throw new Error("collaboration document could not be persisted");
        // A peer may edit between the comparison above and serialization.
        // Return only the revision of the exact text that was written.
        if (durable.code !== code) {
          return { outcome: "CONFLICT", code: durable.code, updatedAt: durable.updatedAt };
        }
        return { outcome: "SAVED", updatedAt: durable.updatedAt };
      }

      /**
       * Otherwise, compare and swap.
       *
       * The revision is checked by the write itself rather than before it: two
       * saves that read the same revision and then both wrote unconditionally
       * would both report success, and the second would silently replace the
       * first. `updateManyAndReturn` with the revision in its predicate updates one row
       * or none, and none means somebody committed in between.
       */
      const stale =
        existing.code !== code &&
        (input.baseUpdatedAt === null ||
          existing.updatedAt.getTime() !== input.baseUpdatedAt.getTime());
      if (stale) {
        this.logger.warn(
          `refused a stale draft snapshot for material ${input.materialId}`,
        );
        return {
          outcome: "CONFLICT",
          updatedAt: existing.updatedAt,
          code: existing.code,
        };
      }

      const [saved] = await this.prisma.exerciseDraft.updateManyAndReturn({
        where: { id: existing.id, updatedAt: existing.updatedAt },
        data: { code, updatedAt: new Date(Math.max(Date.now(), existing.updatedAt.getTime() + 1)) },
        select: { updatedAt: true },
      });
      if (!saved) continue;
      return { outcome: "SAVED", updatedAt: saved.updatedAt };
    }

    // Three rounds all lost to a concurrent writer. Reported as a conflict
    // rather than retried forever: the caller still holds its text, and
    // something else is plainly writing this draft right now.
    const current = await this.prisma.exerciseDraft.findUnique({
      where: {
        userId_materialId: {
          userId: input.userId,
          materialId: input.materialId,
        },
      },
      select: { code: true, updatedAt: true },
    });
    this.logger.warn(
      `gave up writing draft for material ${input.materialId} after ${maxAttempts} attempts`,
    );
    return {
      outcome: "CONFLICT",
      updatedAt: current?.updatedAt ?? new Date(),
      code: current?.code ?? code,
    };
  }

  /** Null when another writer created this draft first. */
  private async createFirstDraft(
    input: DraftSaveInput,
    code: string,
  ): Promise<Date | null> {
    try {
      const created = await this.prisma.exerciseDraft.create({
        data: {
          userId: input.userId,
          materialId: input.materialId,
          sourceMaterialId: input.sourceMaterialId,
          courseId: input.courseId,
          code,
        },
        select: { updatedAt: true },
      });
      return created.updatedAt;
    } catch (error) {
      if (isUniqueViolation(error)) return null;
      throw error;
    }
  }

  /**
   * A draft the student threw away.
   *
   * The live document goes with it. Leaving one resident would have its next
   * flush try to write a row that no longer exists, and report the failure as
   * unsaved student work.
   */
  async discard(input: { userId: string; materialId: string }): Promise<boolean> {
    const existing = await this.prisma.exerciseDraft.findUnique({
      where: {
        userId_materialId: {
          userId: input.userId,
          materialId: input.materialId,
        },
      },
      select: { id: true },
    });
    if (!existing) return false;
    this.authority?.forget(existing.id);
    const { count } = await this.prisma.exerciseDraft.deleteMany({
      where: { id: existing.id },
    });
    return count > 0;
  }
}

/** Prisma's unique-constraint code, without importing its error class. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}
