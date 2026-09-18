import { Injectable, Logger } from "@nestjs/common";
import {
  monitoringRooms,
  monitoringServerEvents,
  type MonitoringVisitEndReason,
} from "@cove/shared";
import type { Server } from "socket.io";

import { monitoringLogLine } from "./monitoring-event-mapper.js";
import { WatchSessionRegistry } from "./watch-session.registry.js";
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
    private readonly watchSessions: WatchSessionRegistry,
  ) {}

  private helpScopeChanged: ((scope: { academyId?: string; classId?: string; teacherMembershipRef?: string; studentMembershipRef?: string }) => Promise<void>) | null = null;
  onHelpScopeChanged(callback: NonNullable<MonitoringRevocationService['helpScopeChanged']>) { this.helpScopeChanged = callback; }

  private cleanupWatch: ((visitId: string, reason: MonitoringVisitEndReason) => Promise<void>) | null = null;
  attach(server: Server, cleanupWatch?: (visitId: string, reason: MonitoringVisitEndReason) => Promise<void>): void {
    this.server = server;
    this.cleanupWatch = cleanupWatch ?? null;
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
    try { await this.helpScopeChanged?.(scope); }
    catch { this.logger.warn("Help queue reconciliation failed; next authorized read will retry."); }
    const started = Date.now();
    const ended = await this.visits.endOpenVisits(scope, reason);


    const server = this.server;
    if (!server) {
      // The visits are closed either way. Without a gateway in this process
      // there is no socket to remove, and the next join re-runs the predicate.
      return;
    }

    /**
     * Which students need their indicator recomputed afterwards.
     *
     * Collected rather than published per visit, because a student watched by
     * three teachers of whom one was revoked must end up with one summary
     * saying two, not three summaries racing each other to say it.
     */
    const affectedStudents = new Map<
      string,
      { academyId: string; studentMembershipId: string; draftId: string | null }
    >();

    for (const visit of ended) {
      // The lease carries the draft and the session the audit row does not.
      // Ending it here is what stops the watch on every instance at once: the
      // next privileged message from that socket fails `isCurrent` wherever it
      // is connected, without this service having to reach it.
      const lease = await this.watchSessions.endByVisitId(visit.id);
      affectedStudents.set(`${visit.studentMembershipRef}:${lease?.draftId ?? ""}`, {
        academyId: visit.academyId,
        studentMembershipId: visit.studentMembershipRef,
        draftId: lease?.draftId ?? null,
      });

      const teacherRoom = monitoringRooms.teacher(
        visit.academyId,
        visit.teacherMembershipRef,
      );

      // Addressed to the teacher's room but qualified by the visit, so a
      // teacher watching four other students in four other tabs sees one tab
      // close rather than all five. The old version emitted an unqualified
      // ending here and then disconnected every socket in the room, which is
      // exactly the cross-tab damage this scope exists to prevent.
      // Removing the rooms matters as much as the message: a client that
      // ignored the event must still stop receiving code and cursors.
      // `fetchSockets` crosses instances through the adapter, so the teacher's
      // socket is reached wherever it is connected — not only when the
      // mutation happened to land on the same process.
      await this.evictRevokedWatch(server, teacherRoom, visit, lease?.draftId ?? null, reason);
      await this.cleanupWatch?.(visit.id, reason);
    }

    // The roster subscription is a separate grant from any watch, so it needs
    // its own sweep: a teacher removed from a class may have been reading its
    // presence list without watching anybody, and no visit would name them.
    if (!scope.studentMembershipRef) await this.leaveRevokedPresence(server, scope, reason);

    // Recomputed once per student, after every matching watch has gone, and
    // preserving whatever independently authorized watchers remain. A student
    // whose second teacher is still reading keeps their indicator.
    for (const student of affectedStudents.values()) {
      try {
        const summary = await this.watchSessions.summarize({
          academyId: student.academyId,
          classId: null,
          studentMembershipId: student.studentMembershipId,
          draftId: student.draftId,
        });
        server
          .to(
            monitoringRooms.student(
              student.academyId,
              student.studentMembershipId,
            ),
          )
          .emit(monitoringServerEvents.watchSummary, summary);
      } catch {
        // Revocation has already taken effect in the registry and the audit
        // log. A summary that could not be rebuilt is a stale indicator, not
        // retained access, and the student's next fetch corrects it.
      }
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
   * Takes one revoked watch out of its rooms, and leaves the rest alone.
   *
   * The predecessor matched draft rooms by prefix and then disconnected every
   * socket in the teacher's room. With one watch per teacher that was merely
   * blunt; with five it is wrong — four of those sockets hold watches on
   * students this revocation says nothing about, and dropping their transport
   * ends four legitimate sessions to close one.
   *
   * So the unit is the visit. A socket is acted on only when the watch it
   * holds *is* the revoked one, it leaves only that watch's rooms, and it is
   * never disconnected: its other tabs, its class subscriptions, and its
   * presence rooms are all still authorized.
   */
  private async evictRevokedWatch(
    server: Server,
    teacherRoom: string,
    visit: { id: string; academyId: string; classId: string },
    draftId: string | null,
    reason: MonitoringVisitEndReason,
  ): Promise<void> {
    const sockets = await server.in(teacherRoom).fetchSockets();
    for (const socket of sockets) {
      const watch = (socket.data as RevocableSocketData).teacher?.watch;
      if (watch?.visitId !== visit.id) continue;
      socket.emit(monitoringServerEvents.accessRevoked, {
        classId: visit.classId, studentMembershipId: watch.claim.studentMembershipId, reason,
      });
      socket.emit(monitoringServerEvents.watchEnded, {
        classId: visit.classId, studentMembershipId: watch.claim.studentMembershipId,
        draftId: draftId ?? watch.draftId, visitId: visit.id, reason, endedAt: new Date().toISOString(),
      });
      if (draftId) {
        socket.leave(monitoringRooms.draft(visit.academyId, draftId));
      }
      socket.leave(
        monitoringRooms.watchContext(
          visit.academyId,
          visit.classId,
          watch.claim.studentMembershipId,
        ),
      );
      // The gateway's own state must agree, or this socket would keep
      // answering `requireDraftAccess` from memory until its next lease check.
      // Keep the owner state until its renewal observes the revoked lease.
      // That path releases the document hold and clears this peer's awareness.
      // Mutating a RemoteSocket data snapshot would not update its owner anyway.
    }
  }

  /**
   * A class-wide revocation also ends the roster subscription.
   *
   * Separate from the watch eviction above, and deliberately so. A watch and a
   * roster subscription are two different grants: a teacher removed from one
   * class keeps every other class they are subscribed to, and a teacher who
   * was only reading the roster holds no visit for the eviction loop to find.
   * Sweeping the class's own presence room is what reaches them, and leaving
   * that one room is the whole of what the removal means for their socket.
   */
  private async leaveRevokedPresence(
    server: Server,
    scope: { academyId?: string; classId?: string; teacherMembershipRef?: string },
    reason: MonitoringVisitEndReason,
  ): Promise<void> {
    // Rooms are serialized across instances; Map-valued socket data is not.
    const sockets = await server.fetchSockets();
    for (const socket of sockets) {
      const teacher = (socket.data as RevocableSocketData).teacher;
      if (!teacher || (scope.teacherMembershipRef && teacher.membershipId !== scope.teacherMembershipRef)) continue;
      for (const room of socket.rooms) {
        const match = /^academy:([^:]+):class:([^:]+):presence$/.exec(room);
        if (!match || (scope.academyId && match[1] !== scope.academyId) || (scope.classId && match[2] !== scope.classId)) continue;
        await socket.leave(room);
        if (teacher.claims instanceof Map) teacher.claims.delete(match[2]!);
        // Only the roster's scope is revoked. A separate watch remains valid.
        socket.emit(monitoringServerEvents.accessRevoked, { classId: match[2], studentMembershipId: null, reason });
      }
    }
  }
}

/**
 * What this service needs to read off a socket.
 *
 * Structural rather than imported from the gateway: revocation is deliberately
 * in a module that imports nothing, so that the services changing a class or a
 * membership can publish an access change without pulling authentication and
 * the gateway in behind them.
 */
type RevocableSocketData = {
  teacher?: {
    /** Undefined on a socket whose teacher state predates this field. */
    membershipId?: string;
    claims?: Map<string, unknown>;
    watch: {
      visitId: string;
      draftId: string;
      claim: { studentMembershipId: string };
    } | null;
  } | null;
};
