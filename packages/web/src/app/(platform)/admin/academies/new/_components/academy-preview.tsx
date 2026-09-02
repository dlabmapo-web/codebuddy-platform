'use client';

import { Building2, Clock, Link2, Mail, UserPlus } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useLocale } from '@/i18n';
import { cn } from '@/lib/utils';

/**
 * The academy taking shape, beside the form that is shaping it.
 *
 * Every field on this form has a consequence the operator cannot see from the
 * field itself. The address becomes a URL that outlives the person typing it.
 * The time zone silently decides when "today" ends for every deadline and
 * report. The handover choice decides who gets the keys. So this shows the
 * *consequences* rather than echoing the inputs — a mirror of the form would be
 * decoration, and the form is right there.
 *
 * ## The clock
 *
 * The one thing here that moves, and the reason the panel earns its place.
 *
 * A time zone is the only field on this form an operator can get wrong with no
 * feedback at all: `Asia/Seoul` and `Asia/Tashkent` are equally plausible in a
 * dropdown, and the mistake surfaces weeks later as homework that closed at the
 * wrong hour. Showing what time it is there *now* turns a four-hour arithmetic
 * problem into a glance — an operator in Tashkent choosing Seoul sees tomorrow's
 * date sitting in the panel and knows before they submit.
 *
 * Nothing renders until mounted. A server-rendered clock is already wrong when
 * it reaches the browser, and React would flag the mismatch.
 */
export function AcademyPreview({
  contactEmail,
  managerEmail,
  name,
  onboarding,
  slug,
  slugValid,
  timeZone,
}: {
  contactEmail: string;
  managerEmail: string;
  name: string;
  onboarding: 'open' | 'invitation';
  slug: string;
  slugValid: boolean;
  timeZone: string;
}) {
  const { t } = useTranslation('platform');
  const locale = useLocale();
  const clock = useLocalTime(timeZone, locale);

  const named = name.trim().length > 0;

  return (
    <aside
      aria-label={t('create.preview_label')}
      className="overflow-hidden rounded-card border border-border bg-card shadow-[var(--shadow-card)]"
    >
      <p className="border-b border-border bg-canvas px-4 py-2.5 text-[11.5px] font-bold uppercase tracking-[0.08em] text-sub">
        {t('create.preview_label')}
      </p>

      <div className="grid gap-4 px-4 py-4">
        <Line icon={Building2} tone="brand">
          <span
            className={cn(
              'block truncate text-[15px] font-extrabold leading-tight',
              named ? 'text-ink' : 'text-sub/50',
            )}
          >
            {named ? name.trim() : t('create.preview_name_empty')}
          </span>
        </Line>

        <Line icon={Link2} label={t('create.preview_address')} tone="brand">
          {slugValid ? (
            <span className="block break-all font-mono text-[12.5px] leading-snug text-ink">
              {t('create.slug_preview', { slug })}
            </span>
          ) : (
            <span className="block text-[12.5px] text-sub/50">
              {t('create.preview_address_empty')}
            </span>
          )}
        </Line>

        <Line icon={Clock} label={t('create.preview_now')} tone="teal">
          {/* Reserved height, so the panel does not jump a line taller the
              moment the clock arrives after hydration. */}
          <span className="block min-h-[2.4rem]">
            {clock ? (
              <>
                {/* Tabular figures, but not mono: a locale that writes its
                    own AM/PM marker in words gets those words stretched to the
                    width of a digit. */}
                <span className="block text-[17px] font-bold tabular-nums text-ink">
                  {clock.time}
                </span>
                <span className="block text-[12px] text-sub">{clock.date}</span>
              </>
            ) : null}
          </span>
          <span className="mt-0.5 block truncate font-mono text-[11.5px] text-sub/70">
            {timeZone}
          </span>
        </Line>

        <Line
          icon={onboarding === 'open' ? UserPlus : Mail}
          label={t('create.preview_handover')}
          tone={onboarding === 'open' ? 'brand' : 'teal'}
        >
          <span className="block text-[13px] font-bold text-ink">
            {t(
              onboarding === 'open'
                ? 'create.onboarding_open_label'
                : 'create.onboarding_invite_label',
            )}
          </span>
          <span className="block truncate text-[12px] text-sub">
            {onboarding === 'open'
              ? t('create.preview_handover_open')
              : managerEmail.trim() || t('create.preview_handover_empty')}
          </span>
        </Line>

        {contactEmail.trim() ? (
          <Line icon={Mail} label={t('create.contact_email_label')} tone="brand">
            <span className="block truncate text-[12.5px] text-ink">
              {contactEmail.trim()}
            </span>
          </Line>
        ) : null}
      </div>
    </aside>
  );
}

const tones = {
  brand: 'bg-brand/10 text-brand',
  teal: 'bg-teal/10 text-teal',
} as const;

function Line({
  children,
  icon: Icon,
  label,
  tone,
}: {
  children: React.ReactNode;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label?: string;
  tone: keyof typeof tones;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <span
        aria-hidden
        className={cn(
          'mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg',
          tones[tone],
        )}
      >
        <Icon className="size-3.5" strokeWidth={2.25} />
      </span>
      <span className="min-w-0 flex-1">
        {label ? (
          <span className="mb-0.5 block text-[11px] font-bold uppercase tracking-[0.06em] text-sub/70">
            {label}
          </span>
        ) : null}
        {children}
      </span>
    </div>
  );
}

/**
 * What time it is in the academy's own zone, to the minute.
 *
 * Ticks every fifteen seconds rather than every second: the panel prints
 * minutes, so a per-second timer would re-render fifty-nine times to change
 * nothing. An unsupported zone yields null and the line stays blank — the form
 * already refuses to submit one, and a fallback to the browser's own zone would
 * be the panel confidently showing the wrong answer.
 */
function useLocalTime(timeZone: string, locale: string) {
  const [now, setNow] = React.useState<Date | null>(null);

  React.useEffect(() => {
    // The first reading is scheduled rather than written here. A state write in
    // an effect body cascades a second render before paint, which React lints
    // against; a zero-delay timer lands it on the next tick instead — the same
    // frame as far as a reader is concerned.
    const first = setTimeout(() => setNow(new Date()), 0);
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);

  return React.useMemo(() => {
    if (!now) return null;
    try {
      return {
        time: new Intl.DateTimeFormat(locale, {
          hour: 'numeric',
          minute: '2-digit',
          timeZone,
        }).format(now),
        date: new Intl.DateTimeFormat(locale, {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          timeZone,
        }).format(now),
      };
    } catch {
      return null;
    }
  }, [locale, now, timeZone]);
}
