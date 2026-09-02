'use client';

import {
  academySlugSchema,
  isSupportedTimeZone,
  slugifyAcademyName,
  type CreatePlatformAcademyInput,
} from '@cove/shared';
import {
  ArrowRight,
  Building2,
  Check,
  KeyRound,
  Mail,
  Pencil,
  UserPlus,
} from 'lucide-react';
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

import { AcademyPreview } from './academy-preview';

type Created = {
  id: string;
  slug: string;
  name: string;
  /** Both null when the academy was created open, with nobody invited. */
  email: string | null;
  token: string | null;
};

/** How this academy gets its first manager. */
type Onboarding = 'open' | 'invitation';

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
 * not "here is your academy" — it is either "an invitation is on its way to
 * somebody who has not accepted it yet" or "this is now on the sign-up page and
 * nothing was sent", and which of the two it is is the thing the operator needs
 * to leave knowing.
 *
 * ## Two sections, because there are two decisions
 *
 * The page's own subtitle says it: *create the academy, then hand it to its
 * manager*. So the form is grouped the same way — what this academy **is**, and
 * **who runs it** — rather than run as six equal fields down a column. The
 * grouping is not decoration: it is why the time zone sits beside the name and
 * the email sits under a radio button.
 *
 * Not numbered. They are not steps — an operator fills them in whatever order
 * they like, and 01 / 02 would claim a sequence that does not exist.
 *
 * ## The first question is how somebody gets in
 *
 * Radio buttons rather than an optional email field. A field that may be left
 * blank does not tell an operator that leaving it blank *does something else*;
 * they read it as one they have not filled in yet. The choice is the point, so
 * the choice is the control, and it comes before the field it governs.
 *
 * Open is the default because it is the reversible one: an academy created open
 * can be sent an invitation a minute later, while an invitation already in
 * flight cannot be unsent. The default should be the choice that is cheapest to
 * change your mind about.
 */
export function CreateAcademyForm() {
  const { t } = useTranslation('platform');
  const errorText = useErrorText();
  const router = useRouter();

  const [name, setName] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [timeZone, setTimeZone] = React.useState(browserTimeZone);
  const [onboarding, setOnboarding] = React.useState<Onboarding>('open');
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
    (onboarding === 'open' || managerEmail.trim().length > 3);

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
          {created.token
            ? t('create.created_body', { email: created.email })
            : t('create.created_open_body')}
        </p>
        {created.token ? (
          <div className="mx-auto mt-5 max-w-lg">
            <InvitationLink academyId={created.id} token={created.token} />
          </div>
        ) : (
          /* "Nothing was sent" is a state an operator will otherwise read as a
             failure, so the open path says what *did* happen and where the
             next step is. */
          <p className="mx-auto mt-5 max-w-md rounded-lg border border-border bg-canvas px-4 py-3 text-[13.5px] leading-relaxed text-sub">
            {t('create.created_open_next')}
          </p>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Button asChild variant="ink">
            <Link href={routes.adminAcademy(created.slug)}>
              {t('create.created_open')}
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </Button>
          {created.token ? null : (
            <Button asChild variant="outline">
              <Link href="/admin/applications">
                {t('create.created_open_applications')}
              </Link>
            </Button>
          )}
          <Button
            onClick={() => {
              setCreated(null);
              setName('');
              setSlug('');
              setSlugTouched(false);
              setOnboarding('open');
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
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
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
          // Omitted entirely for an open academy. Sending an empty string would
          // fail validation; sending the field at all is what mints a token.
          ...(onboarding === 'invitation'
            ? { managerEmail: managerEmail.trim() }
            : {}),
          contactEmail: contactEmail.trim() === '' ? null : contactEmail.trim(),
        };
        try {
          const result = await orpc.platformAcademies.create(input);
          setCreated({
            id: result.academy.id,
            slug: result.academy.slug,
            name: result.academy.name,
            email: result.invitation?.email ?? null,
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
        <SectionHeading icon={Building2} tone="brand">
          {t('create.section_identity')}
        </SectionHeading>

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

        <SectionHeading icon={KeyRound} tone="teal">
          {t('create.section_handover')}
        </SectionHeading>

        <fieldset className="grid gap-2.5">
          <legend className="mb-1 text-[13.5px] font-bold text-ink">
            {t('create.onboarding_legend')}
          </legend>

          <OnboardingChoice
            body={t('create.onboarding_open_body')}
            checked={onboarding === 'open'}
            icon={UserPlus}
            label={t('create.onboarding_open_label')}
            onSelect={() => setOnboarding('open')}
            value="open"
          />

          <OnboardingChoice
            body={t('create.onboarding_invite_body')}
            checked={onboarding === 'invitation'}
            icon={Mail}
            label={t('create.onboarding_invite_label')}
            onSelect={() => setOnboarding('invitation')}
            value="invitation"
          >
            <label className="mt-3 grid gap-1.5" htmlFor="academy-manager-email">
              <span className="text-[13px] font-bold text-ink">
                {t('create.manager_email_label')}
                <span className="ml-1 text-danger">*</span>
              </span>
              <input
                autoComplete="off"
                className={inputClass}
                id="academy-manager-email"
                inputMode="email"
                onChange={(event) => setManagerEmail(event.target.value)}
                type="email"
                value={managerEmail}
              />
              <span className="text-[12.5px] leading-relaxed text-sub">
                {t('create.manager_email_hint')}
              </span>
            </label>
          </OnboardingChoice>
        </fieldset>

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

    {/* Sticky, so the consequences of the time zone and the address stay on
        screen while the operator is still choosing them. Below the form on a
        narrow screen: the form is the job, the panel is the check. */}
    <div className="lg:sticky lg:top-20">
      <AcademyPreview
        contactEmail={contactEmail}
        managerEmail={managerEmail}
        name={name}
        onboarding={onboarding}
        slug={effectiveSlug}
        slugValid={slugValid && effectiveSlug.length > 0}
        timeZone={timeZone}
      />
    </div>
    </div>
  );
}

/**
 * What the fields below it are about.
 *
 * A rule and a hued mark rather than a numbered step, because these are not
 * steps — an operator answers them in whatever order suits them, and a number
 * would promise a sequence the form does not have.
 */
function SectionHeading({
  children,
  icon: Icon,
  tone,
}: {
  children: React.ReactNode;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  tone: 'brand' | 'teal';
}) {
  return (
    <div className="flex items-center gap-2.5 first:mt-0">
      <span
        aria-hidden
        className={cn(
          'grid size-7 shrink-0 place-items-center rounded-lg',
          tone === 'brand' ? 'bg-brand/10 text-brand' : 'bg-teal/10 text-teal',
        )}
      >
        <Icon className="size-3.5" strokeWidth={2.25} />
      </span>
      <h2 className="text-[12px] font-bold uppercase tracking-[0.07em] text-sub">
        {children}
      </h2>
      <span aria-hidden className="h-px flex-1 bg-border" />
    </div>
  );
}

/**
 * One way in, as a card that owns the field it governs.
 *
 * The email input lives *inside* the invitation choice rather than beneath the
 * pair, so it is visibly the consequence of picking that option rather than a
 * seventh field on the form. Choosing the other option does not grey it out —
 * it is not there, which is the honest picture of a form that no longer asks
 * for an address.
 *
 * A real radio behind the card, not a div with an onClick: arrow keys move
 * between the two, the label is clickable, and a screen reader reads it as the
 * one choice it is.
 */
function OnboardingChoice({
  body,
  checked,
  children,
  icon: Icon,
  label,
  onSelect,
  value,
}: {
  body: string;
  checked: boolean;
  children?: React.ReactNode;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  onSelect: () => void;
  value: string;
}) {
  return (
    <label
      className={cn(
        'block cursor-pointer rounded-xl border px-4 py-3.5 transition-colors',
        checked
          ? 'border-brand bg-brand-soft/40 shadow-[0_0_0_1px_var(--color-brand)]'
          : 'border-border bg-canvas hover:border-brand/40',
      )}
    >
      <span className="flex items-start gap-3">
        <input
          checked={checked}
          className="mt-1 size-4 shrink-0 accent-[var(--color-brand)]"
          name="academy-onboarding"
          onChange={onSelect}
          type="radio"
          value={value}
        />
        <span
          aria-hidden
          className={cn(
            'mt-px grid size-8 shrink-0 place-items-center rounded-lg',
            checked ? 'bg-brand text-on-brand' : 'bg-muted text-sub',
          )}
        >
          <Icon className="size-4" strokeWidth={2.25} />
        </span>
        <span className="min-w-0">
          <span className="block text-[14px] font-bold text-ink">{label}</span>
          <span className="mt-0.5 block text-[12.5px] leading-relaxed text-sub">
            {body}
          </span>
        </span>
      </span>
      {checked && children ? <div className="pl-[4.25rem]">{children}</div> : null}
    </label>
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
