import { Module } from "@nestjs/common";

import { SupabaseAuthModule } from "../auth/supabase-auth.module.js";
import { NotificationBroadcaster } from "./notification-broadcaster.js";
import { NotificationsGateway } from "./notifications.gateway.js";
import { NotificationsService } from "./notifications.service.js";

@Module({
  imports: [SupabaseAuthModule],
  providers: [
    NotificationsService,
    NotificationBroadcaster,
    NotificationsGateway,
  ],
  exports: [NotificationsService, NotificationBroadcaster],
})
export class NotificationsModule {}
