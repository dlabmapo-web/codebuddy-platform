'use client';

import type { PlatformAcademyDetail } from '@cove/shared';
import { academySlugSchema } from '@cove/shared';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/studio/button';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';

/**
 * The two fields nobody else can reach.
 *
 * A manager already edits the address, phone, contact email and time zone; a
 * platform admin edits what an academy is called and what it is reached at.
 * Kept apart from those so the two never become two editors of one field.
 */
export function IdentityPanel({
  academy,
  onChange,
}: {
  academy: PlatformAcademyDetail;
  onChange: (next: PlatformAcademyDetail) => void;
}) {
  const { t } = useTranslation('platform');
  const errorText = useErrorText();
  const [name, setName] = React.useState(academy.name);
  const [slug, setSlug] = React.useState(academy.slug);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);

  const archived = academy.status === 'ARCHIVED';
  const slugValid = academySlugSchema.safeParse(slug).success;
  const trimmedName = name.trim();
  const changed = trimmedName !== academy.name || slug !== academy.slug;
  const slugChanged = slug !== academy.slug;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!changed || !slugValid || trimmedName.length < 2) return;
    setPending(true);
    setError(null);
    try {
      const next = await orpc.platformAcademies.update({
        academyId: academy.id,
        name: trimmedName,
        slug,
      });
      onChange(next);
    } catch (cause) {
      setError(cause);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-card border border-border bg-card p-5">
      <h2 className="text-[15px] font-bold">{t('identity.title')}</h2>
      <p className="mt-1 text-[13.5px] leading-[1.6] text-sub">
        {t('identity.description')}
      </p>

      <form className="mt-4 grid gap-4" onSubmit={save}>
        <label className="grid gap-1.5">
          <span className="text-[13.5px] font-bold">{t('identity.name')}</span>
          <input
            className="h-11 rounded-lg border border-border bg-canvas px-3 text-[15px] outline-none focus:border-brand"
            disabled={archived || pending}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </label>

        <label className="grid gap-1.5">
          <span className="text-[13.5px] font-bold">{t('identity.slug')}</span>
          <input
            className={`h-11 rounded-lg border bg-canvas px-3 font-mono text-[14px] outline-none focus:border-brand ${
              slugValid ? 'border-border' : 'border-danger'
            }`}
            disabled={archived || pending}
            maxLength={60}
            onChange={(event) => setSlug(event.target.value)}
            value={slug}
          />
          {/* Said before saving, not after: the cost of a rename is the part
              an operator needs to weigh while deciding. */}
          <span className="text-[12.5px] leading-[1.5] text-sub">
            {slugChanged ? t('identity.slug_warning') : t('identity.slug_help')}
          </span>
        </label>

        {error ? (
          <p className="text-[13.5px] font-semibold text-danger">
            {errorText(error)}
          </p>
        ) : null}

        {archived ? (
          <p className="text-[13.5px] text-sub">{t('identity.archived')}</p>
        ) : (
          <div>
            <Button
              disabled={!changed || !slugValid || trimmedName.length < 2 || pending}
              type="submit"
            >
              {pending ? t('identity.saving') : t('identity.save')}
            </Button>
          </div>
        )}
      </form>
    </section>
  );
}
