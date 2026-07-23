import { authContract } from "./orpc/auth.contract.js";
import {
  academiesContract,
  academyInvitationsContract,
  academyJoinRequestsContract,
  academyMembersContract,
  joinRequestsContract,
} from "./orpc/academies.contract.js";

export const appContract = {
  auth: authContract,
  academies: academiesContract,
  joinRequests: joinRequestsContract,
  academyJoinRequests: academyJoinRequestsContract,
  academyInvitations: academyInvitationsContract,
  academyMembers: academyMembersContract,
};

export type AppContract = typeof appContract;
