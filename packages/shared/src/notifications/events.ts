import { z } from "zod";

import { notificationItemSchema } from "./notification.js";

/**
 * The notification namespace.
 *
 * Its own namespace rather than a corner of `/monitoring`, because the two
 * have almost nothing in common. Monitoring's rooms are classes and drafts,
 * its middleware resolves membership claims, its rate rules are written for
 * terminal deltas and awareness cursors, and its revocation service can close
 * a socket when a teaching assignment is withdrawn. An applicant waiting for
 * approval has no membership, no class and no claim; putting them on that
 * namespace would mean teaching every one of those pieces about a caller who
 * belongs to nothing.
 *
 * The Redis Streams adapter is installed on the *server* in `main.ts`, not on a
 * namespace, so this one inherits cross-instance delivery without any change
 * to it.
 */
export const notificationsNamespace = "/notifications";

/**
 * One room, named after the person in it.
 *
 * Produced here and never accepted from a client — the same rule
 * `monitoringRooms` states. The server derives the id from the verified token,
 * so a payload can never name whose room to emit into.
 */
export const notificationRooms = {
  user: (userId: string) => `user:${userId}`,
} as const;

/**
 * One event, server to client. There are no client events: a socket on this
 * namespace listens and sends nothing, which is what keeps it free of the rate
 * limiter, the invalid-payload budget and the revocation machinery that
 * `/monitoring` needs.
 */
export const notificationServerEvents = {
  created: "notification.created",
} as const;

/**
 * The item travels with the event rather than the client refetching on a bare
 * nudge, so the panel can draw the news in the same frame it arrives. The list
 * endpoint stays authoritative: the client refetches it on every reconnect, so
 * a packet lost inside a tunnel costs a few seconds and nothing else.
 */
export const notificationCreatedPayloadSchema = z.object({
  item: notificationItemSchema,
});
export type NotificationCreatedPayload = z.infer<
  typeof notificationCreatedPayloadSchema
>;
