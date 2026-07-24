import { authContract } from "./orpc/auth.contract.js";
import {
  academiesContract,
  academyInvitationsContract,
  academyJoinRequestsContract,
  academyMembersContract,
  joinRequestsContract,
} from "./orpc/academies.contract.js";
import { academyCoursesContract } from "./orpc/courses.contract.js";

export const appContract = {
  auth: authContract,
  academies: academiesContract,
  joinRequests: joinRequestsContract,
  academyJoinRequests: academyJoinRequestsContract,
  academyInvitations: academyInvitationsContract,
  academyMembers: academyMembersContract,
  academyCourses: academyCoursesContract,
};

export type AppContract = typeof appContract;
