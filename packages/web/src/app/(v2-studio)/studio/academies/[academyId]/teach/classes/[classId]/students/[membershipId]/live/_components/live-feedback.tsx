'use client';

import { monitoringLimits, type MonitoringFeedback } from '@cove/shared';
import { ChevronDown, MessageSquare, Send } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/studio/button';
import { useLocale } from '@/i18n';
import type { MonitoringAckResult } from '@/lib/monitoring/types';

/**
 * Durable written feedback, docked under the workspace.
 *
 * It stays reachable whichever terminal the teacher is reading, because the
 * sentence worth writing is usually prompted by something in one of them. The
 * composer keeps its text on failure — a message the server refused is still
 * the teacher's sentence, and clearing the box would lose it. Nothing is
 * rendered optimistically: every message on screen is a row the server
 * returned.
 */
export function FeedbackDock({
  canSend,
  feedback,
  onSend,
  teacherMembershipRef,
}: {
  canSend: boolean;
  feedback: readonly MonitoringFeedback[];
  onSend: (body: string) => Promise<MonitoringAckResult<{ feedbackId: string }>>;
  /** Recognizes the teacher's own messages without naming their author. */
  teacherMembershipRef: string | null;
}) {
  const { t } = useTranslation('monitoring');
  const locale = useLocale();
  const [open, setOpen] = React.useState(true);
  const [seen, setSeen] = React.useState(feedback.length);
  const [body, setBody] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const listRef = React.useRef<HTMLOListElement>(null);

  const time = React.useMemo(
    () => new Intl.DateTimeFormat(locale, { timeStyle: 'short' }),
    [locale],
  );

  React.useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [feedback.length, open]);

  // Everything on screen when the dock moves either way has been read; only
  // what arrives afterwards, while it is shut, is worth a dot.
  const toggle = () => {
    setSeen(feedback.length);
    setOpen((current) => !current);
  };
  const unread = Math.max(0, feedback.length - seen);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = body.trim();
    if (trimmed.length === 0 || sending) return;
    setSending(true);
    setFailed(false);
    const ack = await onSend(trimmed);
    setSending(false);
    if (ack?.ok) {
      setBody('');
      return;
    }
    setFailed(true);
  };

  return (
    <section className="shrink-0 border-t border-border bg-white">
      <h2>
        <button
          aria-expanded={open}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] font-bold text-ink transition-colors hover:bg-canvas"
          onClick={toggle}
          type="button"
        >
          <MessageSquare aria-hidden className="size-3.5 text-sub" />
          {t('feedback.title')}
          {feedback.length > 0 ? (
            <span className="rounded-full bg-canvas px-1.5 py-0.5 text-[11px] font-bold text-sub">
              {feedback.length}
            </span>
          ) : null}
          {unread > 0 && !open ? (
            <span className="size-1.5 rounded-full bg-brand" />
          ) : null}
          <ChevronDown
            aria-hidden
            className={`ml-auto size-4 text-sub transition-transform ${
              open ? '' : '-rotate-90'
            }`}
          />
        </button>
      </h2>

      {open ? (
        <>
          {/* Capped deliberately: the thread is context for the sentence being
              written, and anything taller starts eating the code it is about. */}
          <ol
            className="max-h-32 space-y-1.5 overflow-y-auto px-3 pb-2"
            ref={listRef}
          >
            {feedback.length === 0 ? (
              <li className="pb-1 text-[13px] text-sub">{t('feedback.empty')}</li>
            ) : (
              feedback.map((message) => {
                const mine = message.teacherMembershipRef === teacherMembershipRef;
                return (
                  <li
                    className={`rounded-lg border-l-2 px-3 py-1.5 ${
                      mine
                        ? 'border-l-brand bg-brand-soft/60'
                        : 'border-l-border bg-canvas'
                    }`}
                    key={message.id}
                  >
                    <p className="text-[11px] font-bold text-sub">
                      {mine ? t('feedback.author_you') : t('feedback.author_teacher')}
                      {' · '}
                      {time.format(new Date(message.createdAt))}
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap text-[13.5px] leading-[1.55]">
                      {message.body}
                    </p>
                  </li>
                );
              })
            )}
          </ol>

          <form className="border-t border-border px-3 py-2" onSubmit={submit}>
            <label className="block">
              <span className="sr-only">{t('feedback.placeholder')}</span>
              <textarea
                className="h-11 w-full resize-none rounded-lg border border-border bg-white px-3 py-1.5 text-[13.5px] outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:bg-canvas disabled:opacity-70"
                disabled={!canSend}
                maxLength={monitoringLimits.feedbackMaxLength}
                onChange={(event) => setBody(event.target.value)}
                // The composer sits inches from the code being discussed, so
                // the shortcut a teacher already uses in chat sends it here too.
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    void submit(event);
                  }
                }}
                placeholder={
                  canSend ? t('feedback.placeholder') : t('feedback.waiting')
                }
                value={body}
              />
            </label>
            <div className="mt-1.5 flex items-center justify-between gap-3">
              <p aria-live="polite" className="text-[12px] text-danger">
                {failed ? t('feedback.failed') : null}
              </p>
              <Button
                disabled={!canSend || sending || body.trim().length === 0}
                type="submit"
              >
                <Send aria-hidden />
                {sending ? t('feedback.sending') : t('feedback.send')}
              </Button>
            </div>
          </form>
        </>
      ) : null}
    </section>
  );
}
