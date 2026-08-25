'use client';

import {
  academySlugSchema,
  isSupportedTimeZone,
  slugifyAcademyName,
  type CreatePlatformAcademyInput,
} from '@cove/shared';
import { ArrowRight, Check, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/studio/button';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';
import { routes } from '@/lib/routes';

import { InvitationLink } from '../../../_components/invitation-link';
import { cn } from '@/lib/utils';

type Created = { id: string; slug: string; name: string; email: string; token: string };

/**
 * Creating an academy, and handing it to somebody.
 *
 * Two fields carry consequences the operator cannot undo later, so both are
 * treated as decisions rather than blanks. The slug is derived from the name
 * and shown as the link it will become — visible, editable, and never silently
 * chosen, because it is permanent in every URL anybody bookmarks. The time zone
 * is asked rather than defaulted, because every deadline and daily report in
 * the academy is measured against it.
 *
 * The form ends on a confirmation rather than a redirect. What happens next is
 * not "here is your academy" — it is "an invitation is on its way to somebody
 * who has not accepted it yet", and that is the thing the operator needs to
 * leave knowing.
 */
export function CreateAcademyForm() {
  const { t } = useTranslation('platform');
  const errorText = useErrorText();
  const router = useRouter();

  const [name, setName] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [timeZone, setTimeZone] = React.useState(browserTimeZone);
  const [managerEmail, setManagerEmail] = React.useState('');
  const [contactEmail, setContactEmail] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);
  const [created, setCreated] = React.useState<Created | null>(null);

  // Follows the name until the operator edits it, then stops — an edited slug
  // is a decision, and having it overwritten by the next keystroke in the name
  // field would undo that decision without saying so.
  const effectiveSlug = slugTouched ? slug : slugifyAcademyName(name);
  const slugValid = academySlugSchema.safeParse(effectiveSlug).success;
  const ready =
    name.trim().length >= 2 &&
    slugValid &&
    isSupportedTimeZone(timeZone) &&
    managerEmail.trim().length > 3;

  if (created) {
    return (
      <section className="rounded-card border border-border bg-card px-6 py-12 text-center">
        <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-success/10">
          <Check aria-hidden className="size-5 text-success" />
        </span>
        <h2 className="mt-3 text-[19px] font-bold text-ink">
          {t('create.created_title', { name: created.name })}
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-sub">
          {t('create.created_body', { email: created.email })}
        </p>
        <div className="mx-auto mt-5 max-w-lg">
          <InvitationLink academyId={created.id} token={created.token} />
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Button asChild variant="ink">
            <Link href={routes.adminAcademy(created.slug)}>
              {t('create.created_open')}
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </Button>
          <Button
            onClick={() => {
              setCreated(null);
              setName('');
              setSlug('');
              setSlugTouched(false);
              setManagerEmail('');
              setContactEmail('');
            }}
            variant="outline"
          >
            {t('create.created_another')}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <form
      className="rounded-card border border-border bg-card"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!ready || pending) return;
        setPending(true);
        setError(null);
        const input: CreatePlatformAcademyInput = {
          name: name.trim(),
          slug: effectiveSlug,
          timeZone,
          managerEmail: managerEmail.trim(),
          contactEmail: contactEmail.trim() === '' ? null : contactEmail.trim(),
        };
        try {
          const result = await orpc.platformAcademies.create(input);
          setCreated({
            id: result.academy.id,
            slug: result.academy.slug,
            name: result.academy.name,
            email: result.invitation.email,
            token: result.token,
          });
          router.refresh();
        } catch (cause) {
          setError(cause);
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="grid gap-6 px-6 py-6">
        <Field
          hint={t('create.name_hint')}
          htmlFor="academy-name"
          label={t('create.name_label')}
          required
        >
          <input
            autoComplete="off"
            className={inputClass}
            id="academy-name"
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </Field>

        <Field
          hint={t('create.slug_hint')}
          htmlFor="academy-slug"
          label={t('create.slug_label')}
          required
        >
          <div className="flex items-center gap-2">
            <input
              autoComplete="off"
              className={cn(
                inputClass,
                'font-mono',
                !slugValid && effectiveSlug.length > 0 && 'border-danger',
              )}
              id="academy-slug"
              maxLength={60}
              onChange={(event) => {
                setSlugTouched(true);
                setSlug(event.target.value);
              }}
              value={effectiveSlug}
            />
            {!slugTouched && effectiveSlug.length > 0 ? (
              <Button
                onClick={() => setSlugTouched(true)}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Pencil aria-hidden className="size-3.5" />
                {t('create.slug_edit')}
              </Button>
            ) : null}
          </div>
          {effectiveSlug.length > 0 && slugValid ? (
            <p className="mt-1.5 font-mono text-[12.5px] text-sub">
              {t('create.slug_preview', { slug: effectiveSlug })}
            </p>
          ) : null}
        </Field>

        <Field
          hint={t('create.time_zone_hint')}
          htmlFor="academy-time-zone"
          label={t('create.time_zone_label')}
          required
        >
          <select
            className={inputClass}
            id="academy-time-zone"
            onChange={(event) => setTimeZone(event.target.value)}
            value={timeZone}
          >
            {timeZoneOptions.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </Field>

        <Field
          hint={t('create.manager_email_hint')}
          htmlFor="academy-manager-email"
          label={t('create.manager_email_label')}
          required
        >
          <input
            autoComplete="off"
            className={inputClass}
            id="academy-manager-email"
            inputMode="email"
            onChange={(event) => setManagerEmail(event.target.value)}
            type="email"
            value={managerEmail}
          />
        </Field>

        <Field
          hint={t('create.contact_email_hint')}
          htmlFor="academy-contact-email"
          label={t('create.contact_email_label')}
          optional={t('create.contact_email_optional')}
        >
          <input
            autoComplete="off"
            className={inputClass}
            id="academy-contact-email"
            inputMode="email"
            onChange={(event) => setContactEmail(event.target.value)}
            type="email"
            value={contactEmail}
          />
        </Field>

        {error ? (
          <p
            className="rounded-lg bg-danger/10 px-3 py-2 text-[13.5px] text-danger"
            role="alert"
          >
            {errorText(error)}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
        <Button asChild variant="ghost">
          <Link href="/admin">{t('create.cancel')}</Link>
        </Button>
        <Button disabled={!ready || pending} type="submit" variant="ink">
          {pending ? t('create.submitting') : t('create.submit')}
        </Button>
      </div>
    </form>
  );
}

const inputClass =
  'h-10 w-full rounded-lg border border-border bg-card px-3 text-[14px] text-ink outline-none placeholder:text-sub focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/30';

function Field({
  label,
  hint,
  htmlFor,
  required,
  optional,
  children,
}: {
  label: string;
  hint: string;
  htmlFor: string;
  required?: boolean;
  optional?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <label className="flex items-baseline gap-1.5" htmlFor={htmlFor}>
        <span className="text-[13.5px] font-bold text-ink">{label}</span>
        {required ? <span className="text-danger">*</span> : null}
        {optional ? (
          <span className="text-[12px] font-medium text-sub">{optional}</span>
        ) : null}
      </label>
      {children}
      <p className="text-[12.5px] leading-relaxed text-sub">{hint}</p>
    </div>
  );
}

/**
 * A short list rather than every IANA zone.
 *
 * Cove's academies are in Korea today, and a select with six hundred entries is
 * a worse answer than one with the handful anybody will pick — plus whatever
 * the operator's own browser reports, so a new region is one keystroke away
 * from being right rather than a code change.
 */
const timeZoneOptions = Array.from(
  new Set(
    [
      typeof Intl === 'undefined'
        ? 'Asia/Seoul'
        : Intl.DateTimeFormat().resolvedOptions().timeZone,
      'Asia/Seoul',
      'Asia/Tokyo',
      'Asia/Shanghai',
      'Asia/Singapore',
      'Asia/Tashkent',
      'Europe/London',
      'America/New_York',
      'America/Los_Angeles',
      'UTC',
    ].filter((zone): zone is string => Boolean(zone) && isSupportedTimeZone(zone)),
  ),
);

const browserTimeZone = timeZoneOptions[0] ?? 'Asia/Seoul';
