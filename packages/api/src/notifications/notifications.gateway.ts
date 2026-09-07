import { Logger } from "@nestjs/common";
import {
  WebSocketGateway,
  type OnGatewayConnection,
} from "@nestjs/websockets";
import { notificationRooms, notificationsNamespace } from "@cove/shared";
import type { Server, Socket } from "socket.io";

import { SupabaseAuthService } from "../auth/supabase-auth.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { NotificationBroadcaster } from "./notification-broadcaster.js";

type NotificationSocketData = { userId: string };
type NotificationSocket = Socket & { data: NotificationSocketData };

/**
 * The notification namespace: one room per person, one event, no client
 * messages.
 *
 * Everything it does fits in a paragraph, and that is the point of it being
 * separate from `/monitoring`. Identity is established once, from the access
 * token, before any packet is accepted — the same rule and the same
 * `SupabaseAuthService` the HTTP surface uses, so a socket cannot become a
 * second, weaker way in. A client never names a room; the server derives the
 * only room there is from the token it just verified.
 *
 * There is no rate limiter and no invalid-payload budget because this
 * namespace accepts no messages at all. There is no revocation service because
 * membership of your own room cannot be revoked by an academy.
 */
@WebSocketGateway({ namespace: notificationsNamespace })
export class NotificationsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly auth: SupabaseAuthService,
    private readonly prisma: PrismaService,
    private readonly broadcaster: NotificationBroadcaster,
  ) {}

  afterInit(server: Server): void {
    server.use((rawSocket, next) => {
      const socket = rawSocket as NotificationSocket;
      const token = bearerFromHandshake(socket);
      if (!token) {
        next(new Error("AUTHENTICATION_REQUIRED"));
        return;
      }
      void this.auth
        .verifyAccessToken(token)
        .then(async (identity) => {
          // The room is keyed on the Cove user id rather than the Supabase
          // one, because that is the id the review transaction knows. One
          // unique-indexed read per connection, and none per event.
          const user = await this.prisma.user.findUnique({
            where: { authUserId: identity.authUserId },
            select: { id: true },
          });
          if (!user) {
            next(new Error("PROFILE_INCOMPLETE"));
            return;
          }
          socket.data = { userId: user.id };
          next();
        })
        .catch(() => {
          next(new Error("AUTHENTICATION_REQUIRED"));
        });
    });

    // Delivery has to reach whichever instance holds the applicant's socket,
    // which is the adapter's job — so the broadcaster borrows the server
    // rather than opening a channel of its own. Same arrangement as
    // `MonitoringFeedbackBroadcaster`.
    this.broadcaster.attach(server);
  }

  handleConnection(socket: NotificationSocket): void {
    const { userId } = socket.data;
    if (!userId) {
      // The middleware above refuses before this runs, so reaching here means
      // the handshake was accepted without identity — close rather than leave
      // a socket in a room it was never put in.
      socket.disconnect(true);
      return;
    }
    void socket.join(notificationRooms.user(userId));
  }
}

function bearerFromHandshake(socket: Socket): string | null {
  const auth = socket.handshake.auth as { token?: unknown } | undefined;
  if (typeof auth?.token === "string" && auth.token.trim().length > 0) {
    return auth.token.trim();
  }
  const header = socket.handshake.headers.authorization;
  if (typeof header === "string" && header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length).trim() || null;
  }
  return null;
}
