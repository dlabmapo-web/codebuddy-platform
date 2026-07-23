import { oc } from "@orpc/contract";
import { z } from "zod";

import {
  authMeResponseSchema,
  socialAuthProviderSchema,
} from "../../auth/index.js";
import { emptyInputSchema } from "./common.contract.js";

export const authContract = {
  bootstrap: oc.input(emptyInputSchema).output(authMeResponseSchema),
  createOAuthOnboardingIntent: oc
    .input(z.object({
      academyId: z.uuid(),
      provider: socialAuthProviderSchema,
    }))
    .output(z.object({
      token: z.string().min(32),
      expiresAt: z.iso.datetime(),
    })),
  completeOAuthOnboarding: oc
    .input(z.object({ intentToken: z.string().min(32).optional() }))
    .output(authMeResponseSchema),
  me: oc.input(emptyInputSchema).output(authMeResponseSchema),
};
