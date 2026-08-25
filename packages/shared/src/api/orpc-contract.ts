import {
  academyTeacherOverviewContract,
  academyTeacherStudentsContract,
} from "./orpc/academy-teacher-overview.contract.js";
import { authContract } from "./orpc/auth.contract.js";
import {
  academiesContract,
  academyInvitationsContract,
  academyJoinRequestsContract,
  academyMembersContract,
  joinRequestsContract,
} from "./orpc/academies.contract.js";
import { academyClassesContract } from "./orpc/classes.contract.js";
import { academyContentImportsContract } from "./orpc/content-imports.contract.js";
import { academyCoursesContract } from "./orpc/courses.contract.js";
import { learnContract } from "./orpc/learn.contract.js";
import {
  academyOperationsOverviewContract,
  academyOperationsProfileContract,
  academyPeopleContract,
} from "./orpc/manager-overview.contract.js";
import { monitoringContract } from "./orpc/monitoring.contract.js";
import { platformAcademiesContract } from "./orpc/platform.contract.js";
import { pointsContract } from "./orpc/points.contract.js";
import {
  academyInvitationDeliveryContract,
  academyPeopleBulkContract,
  academyPeopleImportContract,
} from "./orpc/people-operations.contract.js";
import {
  academyProfileContract,
  profileContract,
} from "./orpc/profile.contract.js";
import { studentSessionContract } from "./orpc/student-session.contract.js";
import { academyCurriculumOverviewContract } from "./orpc/team-lead-overview.contract.js";
import { teacherProgressContract } from "./orpc/teacher-progress.contract.js";

export const appContract = {
  auth: authContract,
  academies: academiesContract,
  joinRequests: joinRequestsContract,
  academyJoinRequests: academyJoinRequestsContract,
  academyInvitations: academyInvitationsContract,
  academyMembers: academyMembersContract,
  profile: profileContract,
  academyProfile: academyProfileContract,
  academyCourses: academyCoursesContract,
  academyContentImports: academyContentImportsContract,
  academyClasses: academyClassesContract,
  learn: learnContract,
  monitoring: monitoringContract,
  platformAcademies: platformAcademiesContract,
  points: pointsContract,
  studentSession: studentSessionContract,
  teacherProgress: teacherProgressContract,
  academyOperationsOverview: academyOperationsOverviewContract,
  academyOperationsProfile: academyOperationsProfileContract,
  academyPeople: academyPeopleContract,
  academyPeopleImport: academyPeopleImportContract,
  academyPeopleBulk: academyPeopleBulkContract,
  academyInvitationDelivery: academyInvitationDeliveryContract,
  academyCurriculumOverview: academyCurriculumOverviewContract,
  academyTeacherOverview: academyTeacherOverviewContract,
  academyTeacherStudents: academyTeacherStudentsContract,
};

export type AppContract = typeof appContract;
