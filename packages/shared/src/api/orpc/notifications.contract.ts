import { oc } from "@orpc/contract";
import { z } from "zod";

import {
  acknowledgeNotificationSchema,
  notificationListSchema,
} from "../../notifications/notification.js";
import { successResponseSchema } from "./common.contract.js";

/**
 * The bell, for the signed-in account and nobody else.
 *
 * No academy id anywhere in the shapes: these are facts about the reader, and
 * scoping them to an academy would be asking a question the caller is not yet
 * a member of one to answer.
 */
export const notificationsContract = {
  list: oc.input(z.object({})).output(notificationListSchema),
  /**
   * Dismisses one decision. Opening the panel does not acknowledge — acting on
   * an item does, so news cannot be lost to a stray click on the bell.
   */
  acknowledge: oc
    .input(acknowledgeNotificationSchema)
    .output(successResponseSchema),
};
