import { oc } from "@orpc/contract";

import { authMeResponseSchema } from "../../auth/index.js";
import { emptyInputSchema } from "./common.contract.js";

export const authContract = {
  bootstrap: oc.input(emptyInputSchema).output(authMeResponseSchema),
  me: oc.input(emptyInputSchema).output(authMeResponseSchema),
};
