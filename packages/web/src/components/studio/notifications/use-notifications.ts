'use client';

import type { NotificationItem } from '@cove/shared';
import { notificationServerEvents } from '@cove/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { createNotificationSocket } from '@/lib/notifications/socket';
import { orpc } from '@/lib/orpc';

const queryKey = ['notifications', 'list'] as const;

/**
 * The bell's state.
 *
 * The list endpoint is the source of truth and the socket is a courier. That
 * split is what makes the feature degrade well: with no Redis, no socket, or a
 * tunnel in the way, the bell still tells the truth — it just tells it when
 * the tab is next focused instead of instantly.
 *
 * There is no polling interval. A signed-in session holds one socket, and
 * adding a timer beside it would spend a request per minute per member of the
 * platform to re-learn something the socket already said.
 */
export function useNotifications() {
  const client = useQueryClient();
  const [announcement, setAnnouncement] = React.useState<string | null>(null);

  const list = useQuery({
    queryKey,
    queryFn: () => orpc.notifications.list({}),
    // The one refetch that matters when realtime is unavailable: somebody
    // comes back to the tab and wants the truth.
    refetchOnWindowFocus: true,
    staleTime: 30_000,
    retry: false,
  });

  React.useEffect(() => {
    const socket = createNotificationSocket();

    function onCreated(payload: { item: NotificationItem }) {
      // Written into the cache so the panel can draw the news in the same
      // frame it arrives, and invalidated behind it so the list — which owns
      // the unread count and the ordering — stays authoritative.
      client.setQueryData(
        queryKey,
        (
          current:
            | { items: NotificationItem[]; unreadCount: number }
            | undefined,
        ) => {
          if (!current) return current;
          const without = current.items.filter(
            (item) => item.id !== payload.item.id,
          );
          const items = [payload.item, ...without];
          return {
            items,
            unreadCount: items.filter((item) => item.acknowledgedAt === null)
              .length,
          };
        },
      );
      void client.invalidateQueries({ queryKey });
      setAnnouncement(payload.item.id);
    }

    socket.on(notificationServerEvents.created, onCreated);
    // A reconnect may have missed a packet. Refetching closes that gap in the
    // seconds it takes, which is why nothing here needs delivery guarantees.
    socket.on('connect', () => {
      void client.invalidateQueries({ queryKey });
    });

    return () => {
      socket.off(notificationServerEvents.created, onCreated);
      socket.close();
    };
  }, [client]);

  const acknowledge = useMutation({
    mutationFn: (id: string) => orpc.notifications.acknowledge({ id }),
    onSuccess: () => client.invalidateQueries({ queryKey }),
  });

  return {
    items: list.data?.items ?? [],
    unreadCount: list.data?.unreadCount ?? 0,
    loading: list.isPending,
    failed: list.isError,
    /** The id of the item that most recently arrived over the socket. */
    announcement,
    acknowledge: (id: string) => acknowledge.mutateAsync(id),
  };
}
