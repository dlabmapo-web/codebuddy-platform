'use client';

import { AlertTriangle, Check, Lock, Building2, UserRound } from 'lucide-react';

import { Button } from '@/components/studio/button';
import { useTranslation } from 'react-i18next';
import { useErrorText } from '@/i18n/client/use-error-text';
import { cn } from '@/lib/utils';

import type { ProfileSection } from './use-profile-section';

/**
 * Who may change what, said in words.
 *
 * The design doc is, more than anything, a table of field ownership, and a
 * page that hides that is a page where a student wonders why their school name
 * keeps changing. Every section states its owner at the top — as an icon *and*
 * a phrase, never as a colour, because colour cannot be read aloud.
 */
export type SectionOwner = 'you' | 'shared' | 'academy' | 'read_only';

const ownerIcon = {
  you: UserRound,
  shared: UserRound,
  academy: Building2,
  read_only: Lock,
} as const;

export function SectionCard<TDraft extends object>({
  title,
  description,
  owner,
  accented = false,
  section,
  children,
}: {
  title: string;
  description?: string;
  owner: SectionOwner;
  /**
   * True inside the academy zone, which takes the colour of the role you hold
   * there. The account zone below stays neutral on purpose: global identity
   * belongs to no academy and must not look as though it does.
   */
  accented?: boolean;
  /** Absent for a read-only section, which then renders no save controls. */
  section?: ProfileSection<TDraft>;
  children: React.ReactNode;
}) {
  const { t } = useTranslation('profile');
  const errorText = useErrorText();
  const OwnerIcon = ownerIcon[owner];

  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-card border border-border bg-card',
        // The rail is the page's quiet structural device: it says which zone
        // a section belongs to before a word is read.
        'before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:content-[""]',
        accented
          ? 'before:bg-[color:var(--accent-hue)]'
          : 'before:bg-border',
      )}
    >
      <header className="border-b border-border px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[17px] font-extrabold tracking-[-0.02em]">
              {title}
            </h2>
            {description ? (
              <p className="mt-1.5 text-[13.5px] leading-[1.6] text-sub">
                {description}
              </p>
            ) : null}
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-[11.5px] font-bold uppercase tracking-[0.06em] text-sub">
            <OwnerIcon aria-hidden className="size-3" strokeWidth={2.25} />
            {t(`owner.${owner}`)}
          </span>
        </div>
      </header>

      <div className="space-y-5 px-6 py-5">{children}</div>

      {section ? (
        <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-border bg-muted/50 px-6 py-4">
          {/* Save state is announced, not only drawn: a person using a screen
              reader must hear that their guardian details were stored. */}
          <p aria-live="polite" className="mr-auto text-[13px] font-semibold">
            {section.status === 'saved' ? (
              <span className="inline-flex items-center gap-1.5 text-success">
                <Check aria-hidden className="size-4" strokeWidth={2.5} />
                {t('action.saved')}
              </span>
            ) : null}
            {section.status === 'failed' ? (
              <span className="text-danger">{errorText(section.error)}</span>
            ) : null}
          </p>
          <Button
            disabled={!section.dirty || section.status === 'saving'}
            onClick={section.save}
            size="sm"
            type="button"
          >
            {section.status === 'saving' ? t('action.saving') : t('action.save')}
          </Button>
        </footer>
      ) : null}

      {section?.status === 'conflict' ? (
        <div
          className="border-t border-warning/30 bg-warning/8 px-6 py-4"
          role="alert"
        >
          <p className="flex items-center gap-2 text-[13.5px] font-bold text-warning">
            <AlertTriangle aria-hidden className="size-4" strokeWidth={2.25} />
            {t('conflict.title')}
          </p>
          <p className="mt-1.5 text-[13px] leading-[1.6] text-sub">
            {t('conflict.body')}
          </p>
          <Button
            className="mt-3"
            onClick={section.reset}
            size="sm"
            type="button"
            variant="outline"
          >
            {t('action.reload')}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
