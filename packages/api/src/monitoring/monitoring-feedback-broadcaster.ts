import { Injectable } from "@nestjs/common";
import { monitoringRooms, monitoringServerEvents } from "@cove/shared";
import type { Server } from "socket.io";

import { PrismaService } from "../database/prisma.service.js";

/**
 * Tells a watching teacher that their feedback was read.
 *
 * The read itself is an ordinary HTTP write, and it has to stay one: a student
 * opening a panel must succeed whether or not a socket is up. So the broadcast
 * lives here rather than in the request path — attached like
 * `MonitoringRevocationService`, null-guarded, and best-effort by design.
 *
 * A dropped receipt costs the teacher nothing: the next `listFeedback` carries
 * `readAt` on the row anyway. This exists to spare them the refresh, not to
 * deliver a guarantee.
 */
@Injectable()
export class MonitoringFeedbackBroadcaster {
  private server: Server | null = null;

  constructor(private readonly prisma: PrismaService) {}

  attach(server: Server): void {
    this.server = server;
  }

  /**
   * Emits into the draft room for this student's exercise, when one exists.
   *
   * The room is derived from the draft, never from anything the student sent:
   * they supply a material id, and the server decides which room that means.
   * No draft means nobody has ever collaborated on this exercise, so there is
   * no room and nothing to say.
   */
  async feedbackRead(input: {
    academyId: string;
    studentUserId: string;
    materialId: string;
    readCount: number;
  }): Promise<void> {
    const server = this.server;
    // Nothing was marked, so nothing changed for the teacher either.
    if (!server || input.readCount === 0) return;

    const draft = await this.prisma.exerciseDraft.findUnique({
      where: {
        userId_materialId: {
          userId: input.studentUserId,
          materialId: input.materialId,
        },
      },
      select: { id: true },
    });
    if (!draft) return;

    server
      .to(monitoringRooms.draft(input.academyId, draft.id))
      .emit(monitoringServerEvents.feedbackRead, {
        materialId: input.materialId,
        readCount: input.readCount,
        readAt: new Date().toISOString(),
      });
  }
}
