import type {
  RuntimeDescriptor,
  BrokerExecutionInput,
  BrokerExecutionResult,
} from "@cove/shared";
import type { Budget } from "./resource-bank.js";
export type Allocation = {
  id: string;
  generation: string;
  runtime: RuntimeDescriptor;
  budget: Budget;
  memoryLimitMb: number;
  creationState?: "creating" | "created" | "ready" | "removed";
  containerId?: string;
  cgroupPath?: string;
  hostInitPid?: number;
};
/** create must retain immutable allocation identity even if transport fails. */
export interface GuestDriver {
  verify(): Promise<void>;
  discover(): Promise<string[]>;
  create(allocation: Allocation, signal: AbortSignal): Promise<void>;
  ready(allocation: Allocation, signal: AbortSignal): Promise<void>;
  execute(
    allocation: Allocation,
    input: BrokerExecutionInput,
    signal: AbortSignal,
  ): Promise<BrokerExecutionResult>;
  remove(id: string, facts?: Allocation): Promise<void>;
}
