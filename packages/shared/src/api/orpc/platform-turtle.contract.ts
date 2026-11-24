import { oc } from "@orpc/contract";

import { turtleUsageInputSchema, turtleUsageResultSchema } from "../../platform/turtle-usage.js";

/** Public Turtle use per academy: counts of anonymous devices, never people. */
export const platformTurtleContract = {
  usage: oc.input(turtleUsageInputSchema).output(turtleUsageResultSchema),
};
