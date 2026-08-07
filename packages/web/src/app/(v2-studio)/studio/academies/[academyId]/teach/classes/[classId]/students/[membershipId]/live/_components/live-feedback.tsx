'use client';

import { monitoringLimits, type MonitoringFeedback } from '@cove/shared';
import { Check, ChevronDown, MessageSquare } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/studio/button';
import { useLocale } from '@/i18n';
import type { MonitoringAckResult } from '@/lib/monitoring/types';

/**
 * The teacher's note on this exercise, docked under the workspace.
 *
 * One note per student per exercise, edited in place. The composer opens
 * holding whatever the teacher last wrote, so sending again is visibly a
 * revision rather than a second remark — which is what stopped this from
 * becoming the fourteen-message transcript it used to produce.
 *
 * The composer keeps its text on failure: a note the server refused is still
 * the teacher's sentence, and clearing the box would lose it. Nothing is
 * rendered optimistically — what is on screen is what the server returned.
 */
export function FeedbackDock({
  canSend,
  draft,
  feedback,
  materialId,
  onDraftChange,
  onSend,
  teacherMembershipRef,
}: {
  canSend: boolean;
  /**
   * The composer's text, held by the page and keyed by material.
   *
   * Controlled rather than local because this dock outlives the exercise it
   * is about: a teacher who types half a sentence, reads ahead through the
   * curriculum panel, and comes back must find their words on the thread they
   * were writing them for — and must never find them on another one.
   */
  draft: string;
  feedback: readonly MonitoringFeedback[];
  /** Which thread is on screen. Null before a watch has resolved one. */
  materialId: string | null;
  onDraftChange: (body: string) => void;
  onSend: (body: string) => Promise<MonitoringAckResult<{ feedbackId: string }>>;
  /** Identifies the teacher's own note without naming its author. */
  teacherMembershipRef: string | null;
}) {
  const { t } = useTranslation('monitoring');
  const locale = useLocale();
  const [open, setOpen] = React.useState(true);
  const [sending, setSending] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  const time = React.useMemo(
    () => new Intl.DateTimeFormat(locale, { timeStyle: 'short' }),
    [locale],
  );

  const mine = React.useMemo(
    () =>
      feedback.find((note) => note.teacherMembershipRef === teacherMembershipRef) ??
      null,
    [feedback, teacherMembershipRef],
  );
  const others = React.useMemo(
    () =>
      feedback.filter(
        (note) => note.teacherMembershipRef !== teacherMembershipRef,
      ),
    [feedback, teacherMembershipRef],
  );

  const stored = mine?.body ?? '';
  /**
   * The note the box was last filled from, and which thread it was for.
   *
   * Refilling is keyed on the server's text rather than on a dirty flag: the
   * box follows the server when the server's copy changes, and leaves a
   * half-typed revision alone the rest of the time. Arriving at a thread the
   * teacher already has unsent words on leaves those words alone too.
   */
  const filledRef = React.useRef<{ materialId: string | null; body: string }>({
    materialId: null,
    body: '',
  });
  React.useEffect(() => {
    const filled = filledRef.current;
    const arrived = filled.materialId !== materialId;
    if (!arrived && filled.body === stored) return;
    filledRef.current = { materialId, body: stored };
    if (arrived && draft.length > 0) return;
    onDraftChange(stored);
  }, [draft.length, materialId, onDraftChange, stored]);

  const body = draft;
  const trimmed = body.trim();
  const unchanged = trimmed === (mine?.body ?? '').trim();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (trimmed.length === 0 || unchanged || sending) return;
    setSending(true);
    setFailed(false);
    const ack = await onSend(trimmed);
    setSending(false);
    if (!ack?.ok) setFailed(true);
  };

  return (
    <section className="shrink-0 border-t border-border bg-white">
      <h2>
        <button
          aria-expanded={open}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] font-bold text-ink transition-colors hover:bg-canvas"
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          <MessageSquare aria-hidden className="size-3.5 text-sub" />
          {t('feedback.title')}
          {mine && mine.readAt !== null ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success">
              <Check aria-hidden className="size-3" />
              {t('feedback.read')}
            </span>
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
        <form className="px-3 pb-2.5" onSubmit={submit}>
          <label className="block">
            <span className="sr-only">{t('feedback.note_label')}</span>
            <textarea
              className="h-16 w-full resize-none rounded-lg border border-border bg-white px-3 py-2 text-[13.5px] leading-[1.55] outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:bg-canvas disabled:opacity-70"
              disabled={!canSend}
              maxLength={monitoringLimits.feedbackMaxLength}
              onChange={(event) => onDraftChange(event.target.value)}
              // The composer sits inches from the code being discussed, so the
              // shortcut a teacher already uses in chat sends it here too.
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
            <p aria-live="polite" className="min-w-0 truncate text-[12px]">
              {failed ? (
                <span className="text-danger">{t('feedback.failed')}</span>
              ) : mine ? (
                <span className="text-sub">
                  {t('feedback.saved_at', {
                    time: time.format(new Date(mine.updatedAt)),
                  })}
                </span>
              ) : (
                <span className="text-sub">{t('feedback.none_yet')}</span>
              )}
            </p>
            <Button
              disabled={!canSend || sending || trimmed.length === 0 || unchanged}
              type="submit"
            >
              {sending
                ? t('feedback.sending')
                : mine
                  ? t('feedback.update')
                  : t('feedback.send')}
            </Button>
          </div>

          {/* Rare, and read-only: a co-teacher's note is context for the one
              being written, not something this teacher can edit. */}
          {others.length > 0 ? (
            <ul className="mt-2 space-y-1.5 border-t border-border pt-2">
              {others.map((note) => (
                <li
                  className="rounded-lg border-l-2 border-l-border bg-canvas px-3 py-1.5"
                  key={note.id}
                >
                  <p className="text-[11px] font-bold text-sub">
                    {t('feedback.author_named', {
                      name: note.teacherName ?? t('feedback.author_teacher'),
                    })}
                    {' · '}
                    {time.format(new Date(note.updatedAt))}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-[1.55]">
                    {note.body}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}
