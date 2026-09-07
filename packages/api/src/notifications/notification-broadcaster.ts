import { Injectable, Logger } from "@nestjs/common";
import { notificationRooms, notificationServerEvents } from "@cove/shared";
import type { Server } from "socket.io";

import { NotificationsService } from "./notifications.service.js";

/**
 * Tells somebody their application has been decided, on the screen they are
 * already looking at.
 *
 * Called **after** the review transaction commits, never inside it: an emit
 * inside a transaction announces a decision that a rollback would unmake, and
 * the applicant would be looking at an approval that no longer exists.
 *
 * Best-effort by design, and it must not be able to fail a review. A dropped
 * packet costs the applicant a few seconds — the client refetches the list on
 * every reconnect, and on window focus — where a throw here would cost the
 * manager the approval they just made.
 */
@Injectable()
export class NotificationBroadcaster {
  private readonly logger = new Logger(NotificationBroadcaster.name);
  private server: Server | null = null;

  constructor(private readonly notifications: NotificationsService) {}

  attach(server: Server): void {
    this.server = server;
  }

  /**
   * `userId` is the applicant, resolved by the caller from the row it just
   * wrote — never from anything a client sent.
   */
  async decisionMade(userId: string, requestId: string): Promise<void> {
    const server = this.server;
    // No realtime configured, or the gateway has not initialized. The bell
    // still works; it updates when the tab is next focused.
    if (!server) return;

    try {
      const item = await this.notifications.itemFor(requestId);
      if (!item) return;
      server
        .to(notificationRooms.user(userId))
        .emit(notificationServerEvents.created, { item });
    } catch (error) {
      this.logger.warn(
        `notification broadcast failed for request ${requestId}: ${
          error instanceof Error ? error.message : "unknown"
        }`,
      );
    }
  }
}
