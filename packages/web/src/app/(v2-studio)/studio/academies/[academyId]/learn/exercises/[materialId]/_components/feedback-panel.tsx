'use client';

import type { MonitoringFeedback } from '@cove/shared';
import { MessageSquare, X } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useLocale } from '@/i18n';
import { cn } from '@/lib/utils';

/**
 * The teacher's accent, and the same violet v1 used for the teacher's cursor.
 *
 * Already a token in this design system (`--color-peer`), so the note, the
 * caret, and the pointer a student sees are all one colour: whatever is violet
 * on this screen came from their teacher.
 */
const PEER = 'var(--color-peer)';

/**
 * The teacher's note on this exercise, on the student's screen.
 *
 * Laid out as v1 laid it out — initial avatar, the teacher's name, the time on
 * the right, the note below — because that is the arrangement a student here
 * already reads fluently. What changed underneath is that there is now one
 * note per teacher, rewritten in place, rather than a transcript of every
 * wording it has ever had.
 */
export function FeedbackPanel({
  isHighlighted,
  messages,
  onOpenChange,
  open,
  unreadCount,
}: {
  isHighlighted: (id: string) => boolean;
  /** At most one per teacher. Usually exactly one. */
  messages: readonly MonitoringFeedback[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  unreadCount: number;
}) {
  const { t } = useTranslation('monitoring');
  const locale = useLocale();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const formatStamp = useStampFormatter(locale);

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onOpenChange(false);
      triggerRef.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      onOpenChange(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [onOpenChange, open]);

  // No note is no affordance, as in v1: a student who has never been written
  // to should not see a control whose only content is its own absence.
  if (messages.length === 0) return null;

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        onClick={() => onOpenChange(!open)}
        ref={triggerRef}
        style={{
          borderColor: PEER,
          color: PEER,
          backgroundColor: open || unreadCount > 0 ? 'var(--color-peer-soft)' : 'transparent',
        }}
        type="button"
      >
        <MessageSquare aria-hidden className="size-3.5" />
        <span className="hidden sm:inline">{t('feedback.trigger')}</span>
        {/* The count, as v1 showed it. */}
        <span
          className="grid place-items-center rounded-full text-[10px] font-bold tabular-nums text-white"
          style={{ minWidth: 18, height: 18, backgroundColor: PEER }}
        >
          {messages.length}
        </span>
      </button>

      {/* Announced whether or not the panel opened and whether or not anyone is
          looking at it. The auto-open serves a sighted student; this the rest. */}
      <p aria-live="polite" className="sr-only">
        {unreadCount > 0 ? t('feedback.unread_notice') : ''}
      </p>

      {/* `cove-pop` is the house popover animation, and the reason there is no
          entrance state here: the panel is mounted by `open`, so a CSS
          animation on mount says the same thing without a render pass. */}
      {open ? (
        <div
          aria-label={t('feedback.student_title')}
          className="cove-pop absolute right-0 top-full z-50 mt-1.5 origin-top-right overflow-hidden rounded-2xl border border-border bg-white shadow-lg"
          data-state="open"
          role="dialog"
          // Sized inline, as v1 sized it. Twice now a Tailwind arbitrary value
          // in this file has silently failed to generate and left the panel
          // shrink-wrapped to its own text; a literal width cannot.
          style={{ width: 340, maxWidth: 'calc(100vw - 24px)' }}
        >
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <h2 className="text-[13px] font-bold text-ink">
              {t('feedback.student_title')}
            </h2>
            <button
              aria-label={t('feedback.close')}
              className="ml-auto grid size-6 place-items-center rounded-md text-sub transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              onClick={() => {
                onOpenChange(false);
                triggerRef.current?.focus();
              }}
              type="button"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          </div>

          <ul
            className="divide-y divide-border overflow-y-auto overscroll-contain"
            style={{ maxHeight: 400 }}
          >
            {messages.map((note) => {
              const isNew = isHighlighted(note.id);
              const author = note.teacherName ?? t('feedback.author_teacher');
              return (
                <li
                  className={cn('px-4 py-3', isNew && 'bg-peer-soft/60')}
                  key={note.id}
                >
                  <div className="mb-1.5 flex items-center gap-1.5">
                    {/* v1's initial avatar. It carries nothing the name beside
                        it lacks, but it is what makes a note read as somebody
                        speaking rather than as a system string. */}
                    <span
                      aria-hidden
                      className="grid shrink-0 place-items-center rounded-full font-bold text-white"
                      style={{
                        width: 22,
                        height: 22,
                        fontSize: 11,
                        backgroundColor: PEER,
                      }}
                    >
                      {author.charAt(0)}
                    </span>
                    <span
                      className="truncate text-[12px] font-semibold"
                      style={{ color: PEER }}
                    >
                      {t('feedback.author_named', { name: author })}
                    </span>
                    {isNew ? (
                      <span
                        className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white"
                        style={{ backgroundColor: PEER }}
                      >
                        {t('feedback.new')}
                      </span>
                    ) : null}
                    <time
                      className="ml-auto shrink-0 text-[11px] text-sub"
                      dateTime={note.updatedAt}
                      title={new Date(note.updatedAt).toLocaleString(locale)}
                    >
                      {formatStamp(note.updatedAt)}
                    </time>
                  </div>
                  <p className="whitespace-pre-line text-[13px] leading-[1.65] text-ink">
                    {note.body}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/**
 * v1's stamp — month, day, and the time — but on the app's locale rather than
 * pinned to `ko-KR` as v1 pinned it.
 */
function useStampFormatter(locale: string) {
  return React.useMemo(() => {
    const format = new Intl.DateTimeFormat(locale, {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    return (iso: string) => format.format(new Date(iso));
  }, [locale]);
}
