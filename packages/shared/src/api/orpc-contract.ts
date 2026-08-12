import { authContract } from "./orpc/auth.contract.js";
import {
  academiesContract,
  academyInvitationsContract,
  academyJoinRequestsContract,
  academyMembersContract,
  joinRequestsContract,
} from "./orpc/academies.contract.js";
import { academyClassesContract } from "./orpc/classes.contract.js";
import { academyCoursesContract } from "./orpc/courses.contract.js";
import { learnContract } from "./orpc/learn.contract.js";
import { monitoringContract } from "./orpc/monitoring.contract.js";
import { teacherProgressContract } from "./orpc/teacher-progress.contract.js";

export const appContract = {
  auth: authContract,
  academies: academiesContract,
  joinRequests: joinRequestsContract,
  academyJoinRequests: academyJoinRequestsContract,
  academyInvitations: academyInvitationsContract,
  academyMembers: academyMembersContract,
  academyCourses: academyCoursesContract,
  academyClasses: academyClassesContract,
  learn: learnContract,
  monitoring: monitoringContract,
  teacherProgress: teacherProgressContract,
};

export type AppContract = typeof appContract;
