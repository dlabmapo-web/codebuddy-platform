'use client';

import type { StudentMessage } from '@cove/shared';
import { MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';

import { Panel, useRelativeDay } from './student-primitives';

/**
 * What the student's teachers have written to them.
 *
 * This section exists because the message was already being delivered and
 * already being missed. Feedback is written into one exercise's workspace, and
 * a child who closed the tab had no way back to it — not from the catalog, not
 * from their records, not from anywhere. The row was durable and the reading
 * was not.
 *
 * The author stays anonymous. `Teacher`, no name and no initial, preserving
 * the divergence the feedback delivery design chose deliberately: the live
 * indicator already tells a student that somebody is helping, and a named
 * thread would hand back exactly what the rest of the system withholds.
 *
 * Rows run newest first, by date alone. Sorting unread to the top made a list
 * that prints a date on every row appear to sort wrongly, so unread is carried
 * by a mark on the row and a count in the header instead — the same job,
 * without making the dates lie.
 *
 * The section renders nothing at all when there has never been a message. A
 * child with no feedback should not be shown an empty inbox implying one was
 * expected.
 *
 * See §7.7 of the student academy overview design.
 */
export function TeacherMessages({
  academyId,
  isStale,
  messages,
  unread,
}: {
  academyId: string;
  isStale: boolean;
  messages: StudentMessage[];
  unread: number;
}) {
  const { t } = useTranslation('learning');
  const relativeDay = useRelativeDay();

  if (messages.length === 0) return null;

  return (
    <Panel
      description={t('messages.description')}
      icon={MessageSquare}
      id="messages"
      meta={unread > 0 ? t('messages.unread', { count: unread }) : undefined}
      testId="teacher-messages"
      title={t('messages.title')}
      tone="peer"
    >
      <ul className="divide-y divide-border">
        {messages.map((message) => {
          const isUnread = message.readAt === null;
          const body = (
            <>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {/*
                 * The exercise leads, because it is what tells two notes
                 * apart. "Teacher" is the same word on every row and earns
                 * less weight than the thing the note is about.
                 */}
                {message.exerciseTitle ? (
                  <span className="truncate text-[13px] font-bold">
                    {message.exerciseTitle}
                  </span>
                ) : (
                  <span className="text-[13px] font-bold">
                    {t('messages.author')}
                  </span>
                )}
                {isUnread ? (
                  <span className="shrink-0 rounded-full bg-peer px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.04em] text-on-peer">
                    {t('messages.new')}
                  </span>
                ) : null}
                <span className="ml-auto shrink-0 text-[11.5px] text-sub">
                  {relativeDay(message.createdAt)}
                </span>
              </div>
              <p
                className={cn(
                  'mt-1 whitespace-pre-wrap text-[13.5px] leading-[1.6]',
                  isUnread ? 'text-ink' : 'text-sub',
                )}
              >
                {message.body}
              </p>
            </>
          );

          return (
            <li key={message.id}>
              {message.materialId ? (
                <Link
                  className={cn(
                    'block border-l-[3px] px-4 py-3 transition-colors hover:bg-accent',
                    'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                    isUnread
                      ? 'border-l-peer bg-peer/[0.04]'
                      : 'border-l-transparent',
                    isStale && 'pointer-events-none opacity-50',
                  )}
                  href={`/studio/academies/${academyId}/learn/exercises/${message.materialId}`}
                >
                  {body}
                </Link>
              ) : (
                <div
                  className={cn(
                    'border-l-[3px] px-4 py-3',
                    isUnread
                      ? 'border-l-peer bg-peer/[0.04]'
                      : 'border-l-transparent',
                  )}
                >
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
