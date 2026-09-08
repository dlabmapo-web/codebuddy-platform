import { oc } from "@orpc/contract";

import {
  listPlatformSettingsInputSchema,
  platformFeatureBoardSchema,
  platformPointPolicyBoardSchema,
} from "../../platform/settings.js";

/**
 * How every academy is configured, read across all of them at once.
 *
 * Two reads and no writes, which is the whole shape of this contract and worth
 * saying out loud. Switching a feature on is `academyFeatures.setEnabled` —
 * the academy's own endpoint, which already audits the change against the
 * operator and already accepts one, because `AcademyAccessService` resolves a
 * platform operator as that academy's MANAGER. A second write path here would
 * be a second place for the feature dependency rules to be enforced, and the
 * first one to fall out of step.
 *
 * So the console owns the *question* — which academies have this on, what does
 * each of them pay — and the academy still owns the *change*.
 */
export const platformSettingsContract = {
  /** Every academy's feature switches, one row each. */
  features: oc
    .input(listPlatformSettingsInputSchema)
    .output(platformFeatureBoardSchema),
  /** Every academy's point policy, for reading one against another. */
  pointPolicies: oc
    .input(listPlatformSettingsInputSchema)
    .output(platformPointPolicyBoardSchema),
};
