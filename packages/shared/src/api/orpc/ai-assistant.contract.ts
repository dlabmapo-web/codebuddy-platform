import { oc } from "@orpc/contract";

import {
  academyAiUsageInputSchema,
  academyAiUsageSchema,
  aiLibraryInputSchema,
  aiLibraryViewSchema,
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
  /** One campus's counts and cost, for its manager. Never a student's code or words. */
  academyUsage: oc.input(academyAiUsageInputSchema).output(academyAiUsageSchema),
};
