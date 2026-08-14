import { oc } from "@orpc/contract";

import { studentSessionDeadlineSchema } from "../../auth/student-session.js";
import { emptyInputSchema } from "./common.contract.js";

/** One server-issued inactivity lease for one Supabase login session. */
export const studentSessionContract = {
  begin: oc.input(emptyInputSchema).output(studentSessionDeadlineSchema),
  current: oc.input(emptyInputSchema).output(studentSessionDeadlineSchema),
  extend: oc.input(emptyInputSchema).output(studentSessionDeadlineSchema),
};
