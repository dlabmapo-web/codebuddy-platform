import { Injectable } from '@nestjs/common';
import { monitoringRooms, monitoringServerEvents } from '@cove/shared';
import type { Server } from 'socket.io';
import { PrismaService } from '../database/prisma.service.js';
import { assignedClassWhere, classStudentWhere } from '../classes/assigned-class-access.js';

@Injectable()
export class HelpRequestBroadcaster {
  private server: Server | null = null;
  constructor(private readonly prisma: PrismaService) {}
  attach(server: Server) { this.server = server; }
  async changed(scope: { academyId: string; classId: string; studentMembershipRef: string }) {
    const server = this.server;
    if (!server) return;
    // Revalidate recipients; a stale room is not sufficient authorization.
    const sockets = await server.in(monitoringRooms.classPresence(scope.academyId, scope.classId)).fetchSockets();
    for (const socket of sockets) {
      const teacher = socket.data.teacher as { membershipId?: string } | undefined;
      if (!teacher?.membershipId) continue;
      const member = await this.prisma.academyMembership.findUnique({ where: { id: teacher.membershipId }, select: { userId: true } });
      if (member && await this.prisma.class.findFirst({ where: { id: scope.classId, ...assignedClassWhere({ academyId: scope.academyId, membershipId: teacher.membershipId, userId: member.userId }) }, select: { id: true } })) {
        socket.emit(monitoringServerEvents.helpRequestChanged, { academyId: scope.academyId, classId: scope.classId });
      }
    }
    if (await this.prisma.academyMembership.findFirst({ where: { id: scope.studentMembershipRef, ...classStudentWhere(scope.academyId, scope.classId) }, select: { id: true } })) {
      server.to(monitoringRooms.student(scope.academyId, scope.studentMembershipRef)).emit(monitoringServerEvents.helpRequestChanged, { academyId: scope.academyId, classId: scope.classId });
    }
  }
}
