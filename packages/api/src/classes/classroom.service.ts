import { HttpStatus, Injectable } from '@nestjs/common';
import type { Classroom } from '@cove/shared';
import type { SupabaseIdentity } from '../auth/auth.types.js';
import { AcademyAccessService } from '../authorization/academy-access.service.js';
import { AppException } from '../common/app-exception.js';
import { PrismaService } from '../database/prisma.service.js';
import { readClassroomCurricula } from '../learn/curriculum-read.js';
import { assignedClassWhere, requireAssignedTeacherActor } from './assigned-class-access.js';

/** Teaching metadata without a student identity, roster, monitoring socket or rollout flag. */
@Injectable()
export class ClassroomService {
  constructor(private readonly prisma: PrismaService, private readonly access: AcademyAccessService) {}

  async get(identity: SupabaseIdentity, input: { academyId: string; classId: string }): Promise<Classroom> {
    const actor = await requireAssignedTeacherActor({
      prisma: this.prisma,
      resolveActor: () => this.access.requirePermission(identity.authUserId, input.academyId, 'classes.assigned.manage'),
      academyId: input.academyId,
      deniedCode: 'MONITORING_ACCESS_DENIED',
    });
    const classroom = await this.prisma.class.findFirst({
      where: { id: input.classId, ...assignedClassWhere(actor) },
      select: { id: true, name: true },
    });
    if (!classroom) throw new AppException('MONITORING_ACCESS_DENIED', HttpStatus.FORBIDDEN);
    const courses = await readClassroomCurricula(this.prisma, input.academyId, classroom.id);
    return { class: classroom, courses };
  }
}
