import { describe, expect, it, vi } from 'vitest';
import { monitoringServerEvents, monitoringRooms } from '@cove/shared';
import { HelpRequestBroadcaster } from './help-request-broadcaster.js';
import type { PrismaService } from '../database/prisma.service.js';
import type { Server } from 'socket.io';

describe('help queue notification authorization', () => {
  it('rechecks teacher assignment and sends no queue payload to other students', async () => {
    const authorized = { data: { teacher: { membershipId: 'teacher' } }, emit: vi.fn() };
    const revoked = { data: { teacher: { membershipId: 'revoked' } }, emit: vi.fn() };
    const otherStudent = { data: { student: {} }, emit: vi.fn() };
    const db = {
      academyMembership: { findUnique: vi.fn().mockResolvedValue({ userId: 'user' }), findFirst: vi.fn().mockResolvedValue({ id: 'student' }) },
      class: { findFirst: vi.fn().mockResolvedValueOnce({ id: 'class' }).mockResolvedValueOnce(null) },
    };
    const emit = vi.fn();
    const to = vi.fn().mockReturnValue({ emit });
    const server = { in: vi.fn().mockReturnValue({ fetchSockets: vi.fn().mockResolvedValue([authorized, revoked, otherStudent]) }), to };
    const broadcaster = new HelpRequestBroadcaster(db as unknown as PrismaService);
    broadcaster.attach(server as unknown as Server);
    await broadcaster.changed({ academyId: 'academy', classId: 'class', studentMembershipRef: 'student' });
    expect(authorized.emit).toHaveBeenCalledWith(monitoringServerEvents.helpRequestChanged, { academyId: 'academy', classId: 'class' });
    expect(revoked.emit).not.toHaveBeenCalled();
    expect(otherStudent.emit).not.toHaveBeenCalled();
    expect(to).toHaveBeenCalledWith(monitoringRooms.student('academy', 'student'));
    expect(emit).toHaveBeenCalledWith(monitoringServerEvents.helpRequestChanged, { academyId: 'academy', classId: 'class' });
  });
});
