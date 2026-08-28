import { oc } from "@orpc/contract";

import {
  academyFeatureListSchema,
  listAcademyFeaturesSchema,
  setAcademyFeatureSchema,
} from "../../memberships/academy-features.js";

/**
 * Reading is separate from writing on purpose: every role needs to know which
 * features are on to render itself, and only a manager may change them.
 */
export const academyFeaturesContract = {
  list: oc.input(listAcademyFeaturesSchema).output(academyFeatureListSchema),
  setEnabled: oc.input(setAcademyFeatureSchema).output(academyFeatureListSchema),
};
