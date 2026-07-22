import { authContract } from "./orpc/auth.contract.js";

export const appContract = {
  auth: authContract,
};

export type AppContract = typeof appContract;
