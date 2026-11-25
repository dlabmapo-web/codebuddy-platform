import { oc } from "@orpc/contract";

import {
  aiLibraryInputSchema,
  aiLibraryViewSchema,
  platformAiUsageSchema,
  updateAiLibraryItemInputSchema,
} from "../../content/ai-help.js";

/**
 * The AI assistant's staff and operator surfaces. Students' own procedures are
 * in the learn contract, which cannot name another person.
 */
export const aiAssistantContract = {
  /** One problem's library, with its wrong and correct programs: staff who may edit it. */
  getLibrary: oc.input(aiLibraryInputSchema).output(aiLibraryViewSchema),
  updateLibraryItem: oc.input(updateAiLibraryItemInputSchema).output(aiLibraryViewSchema),
  regenerateLibrary: oc.input(aiLibraryInputSchema).output(aiLibraryViewSchema),
  /** Counts and cost for Cove operators. Never a student's code or words. */
  platformUsage: oc.output(platformAiUsageSchema),
};
