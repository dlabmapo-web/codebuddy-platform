import { oc } from "@orpc/contract";

import {
  academyProfileResponseSchema,
  getAcademyProfileSchema,
  getManagedAcademyProfileSchema,
  myProfileResponseSchema,
  removeAcademyImageSchema,
  removeGlobalImageSchema,
  updateGlobalProfileSchema,
  updateManagedAcademyProfileSchema,
  updateMyAcademyProfileSchema,
  updateMyStaffProfileSchema,
  updateMyStudentDetailsSchema,
  updateMyStudentSelfExpressionSchema,
  updatePreferencesSchema,
} from "../../profile/index.js";
import { emptyInputSchema } from "./common.contract.js";

/**
 * Global identity and academy membership are separate namespaces because they
 * are separately owned. A single `updateProfile` would let one form carry both,
 * and the first bug in it would be an academy manager renaming someone
 * everywhere.
 */
export const profileContract = {
  getMe: oc.input(emptyInputSchema).output(myProfileResponseSchema),
  updateGlobalProfile: oc
    .input(updateGlobalProfileSchema)
    .output(myProfileResponseSchema),
  updatePreferences: oc
    .input(updatePreferencesSchema)
    .output(myProfileResponseSchema),
  removeImage: oc
    .input(removeGlobalImageSchema)
    .output(myProfileResponseSchema),
};

/**
 * Every write returns the whole academy profile.
 *
 * A section save that returned only its own fields would leave the page unable
 * to refresh the revision of the section it just wrote, and a role change
 * between load and save would go unnoticed until the next reload.
 */
export const academyProfileContract = {
  getMine: oc
    .input(getAcademyProfileSchema)
    .output(academyProfileResponseSchema),
  updateMine: oc
    .input(updateMyAcademyProfileSchema)
    .output(academyProfileResponseSchema),
  updateStudentDetails: oc
    .input(updateMyStudentDetailsSchema)
    .output(academyProfileResponseSchema),
  updateStudentSelfExpression: oc
    .input(updateMyStudentSelfExpressionSchema)
    .output(academyProfileResponseSchema),
  updateStaffProfile: oc
    .input(updateMyStaffProfileSchema)
    .output(academyProfileResponseSchema),
  removeImage: oc
    .input(removeAcademyImageSchema)
    .output(academyProfileResponseSchema),
  getForManager: oc
    .input(getManagedAcademyProfileSchema)
    .output(academyProfileResponseSchema),
  updateForManager: oc
    .input(updateManagedAcademyProfileSchema)
    .output(academyProfileResponseSchema),
};
