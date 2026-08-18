import { Injectable, Logger } from "@nestjs/common";
import {
  monitoringRooms,
  monitoringServerEvents,
  type MonitoringVisitEndReason,
} from "@cove/shared";
import type { Server } from "socket.io";

import { monitoringLogLine } from "./monitoring-event-mapper.js";
import { ActiveWatchRegistry } from "./active-watch.registry.js";
import { MonitoringMetricsService } from "./monitoring-metrics.service.js";
import { MonitoringVisitService } from "./monitoring-visit.service.js";

/**
 * Ends monitoring the moment the thing that authorized it changes.
 *
 * Called by the services that change a teacher assignment, a class status, an
 * enrollment, a membership, or a role — always after their transaction commits,
 * so a rolled-back change never revokes anything. Delivery reaches every API
 * instance through the Socket.IO adapter rather than a second channel of its
 * own, which is also what makes it work when the mutation lands on a process
 * holding none of the affected sockets.
 *
 * Periodic claim revalidation in the gateway is the backstop: if this service
 * is unreachable, exposure is bounded by the claim lifetime rather than
 * unbounded.
 */
@Injectable()
export class MonitoringRevocationService {
  private readonly logger = new Logger(MonitoringRevocationService.name);
  /** Null until a gateway exists — the API runs fine without one. */
  private server: Server | null = null;

  constructor(
    private readonly visits: MonitoringVisitService,
    private readonly metrics: MonitoringMetricsService,
    private readonly activeWatches: ActiveWatchRegistry,
  ) {}

  attach(server: Server): void {
    this.server = server;
  }

  /** Archived, or its teacher replaced: nobody keeps watching this class. */
  async revokeClass(
    classId: string,
    reason: MonitoringVisitEndReason,
  ): Promise<void> {
    await this.revoke({ classId }, reason);
  }

  /** One teacher lost the class, or the role, or their membership. */
  async revokeTeacher(
    teacherMembershipId: string,
    reason: MonitoringVisitEndReason,
  ): Promise<void> {
    await this.revoke({ teacherMembershipRef: teacherMembershipId }, reason);
  }

  /** One student left the class, or stopped being an active student. */
  async revokeStudent(
    studentMembershipId: string,
    reason: MonitoringVisitEndReason,
  ): Promise<void> {
    await this.revoke({ studentMembershipRef: studentMembershipId }, reason);
  }

  /**
   * The platform suspended or archived the whole academy: nobody keeps
   * watching anybody in it.
   *
   * The connection guard runs once, when a teacher joins, so an open watch
   * outlives a suspension until something closes it. Without this, suspending
   * an academy would leave every live session already in flight streaming a
   * student's code to a teacher who is no longer allowed to see it.
   */
  async revokeAcademy(
    academyId: string,
    reason: MonitoringVisitEndReason,
  ): Promise<void> {
    await this.revoke({ academyId }, reason);
  }

  /** Revokes only the relationship that changed, preserving unrelated classes. */
  async revokeScope(
    scope: {
      classId: string;
      teacherMembershipRef?: string;
      studentMembershipRef?: string;
    },
    reason: MonitoringVisitEndReason,
  ): Promise<void> {
    await this.revoke(scope, reason);
  }

  /**
   * A membership changed in a way that may end monitoring on either side.
   *
   * Both scopes are revoked because one membership id can be the teacher of
   * one visit and the student of another only in different academies — and
   * checking which would need the role that just changed.
   */
  async revokeMembership(
    membershipId: string,
    reason: MonitoringVisitEndReason,
  ): Promise<void> {
    await this.revokeTeacher(membershipId, reason);
    await this.revokeStudent(membershipId, reason);
  }

  /**
   * Closes the matching visits and empties the rooms they authorized.
   *
   * Idempotent: a duplicate publication finds no open visit and does nothing,
   * so a retry is free.
   */
  private async revoke(
    scope: {
      academyId?: string;
      classId?: string;
      teacherMembershipRef?: string;
      studentMembershipRef?: string;
    },
    reason: MonitoringVisitEndReason,
  ): Promise<void> {
    const started = Date.now();
    const ended = await this.visits.endOpenVisits(scope, reason);
    if (ended.length === 0) return;

    const server = this.server;
    if (!server) {
      // The visits are closed either way. Without a gateway in this process
      // there is no socket to remove, and the next join re-runs the predicate.
      return;
    }

    for (const visit of ended) {
      await this.activeWatches.clear(
        visit.teacherMembershipRef,
        visit.id,
      );
      const teacherRoom = monitoringRooms.teacher(
        visit.academyId,
        visit.teacherMembershipRef,
      );
      const studentRoom = monitoringRooms.student(
        visit.academyId,
        visit.studentMembershipRef,
      );
      const endedAt = new Date().toISOString();

      server.to(teacherRoom).emit(monitoringServerEvents.accessRevoked, {
        classId: visit.classId,
        studentMembershipId: visit.studentMembershipRef,
        reason,
      });
      server.to(teacherRoom).emit(monitoringServerEvents.watchEnded, {
        classId: visit.classId,
        studentMembershipId: visit.studentMembershipRef,
        reason,
        endedAt,
      });
      // The student's indicator disappears on this confirmed end, which is the
      // only thing that removes it.
      server.to(studentRoom).emit(monitoringServerEvents.watchEnded, {
        classId: visit.classId,
        studentMembershipId: visit.studentMembershipRef,
        reason,
        endedAt,
      });

      // Removing the rooms matters as much as the message: a client that
      // ignored the event must still stop receiving code and cursors.
      // `fetchSockets` crosses instances through the adapter, so the teacher's
      // socket is reached wherever it is connected — not only when the
      // mutation happened to land on the same process.
      await this.leaveMonitoringRooms(server, teacherRoom, visit);
    }

    this.metrics.increment("revocation.applied", ended.length);
    this.metrics.observe("revocation.latencyMs", Date.now() - started);
    this.logger.log(
      monitoringLogLine({
        event: "monitoring.revoked",
        reason,
        durationMs: Date.now() - started,
      }),
    );
  }

  /**
   * Takes the revoked teacher out of this class's live rooms.
   *
   * Draft rooms are matched by prefix rather than looked up, because the room
   * name is derived from ids the visit already carries — and a teacher who
   * lost access must leave every one of them, not only the one this service
   * happened to know about.
   */
  private async leaveMonitoringRooms(
    server: Server,
    teacherRoom: string,
    visit: { academyId: string; classId: string },
  ): Promise<void> {
    const draftPrefix = monitoringRooms.draft(visit.academyId, "");
    const presenceRoom = monitoringRooms.classPresence(
      visit.academyId,
      visit.classId,
    );
    const sockets = await server.in(teacherRoom).fetchSockets();
    for (const socket of sockets) {
      for (const room of socket.rooms) {
        if (room.startsWith(draftPrefix) || room === presenceRoom) {
          socket.leave(room);
        }
      }
      socket.disconnect(true);
    }
  }
}
