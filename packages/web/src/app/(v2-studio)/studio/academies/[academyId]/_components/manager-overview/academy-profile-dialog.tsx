'use client';

import type { AcademyProfile } from '@cove/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Trash2, X } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';
import { cn } from '@/lib/utils';

import { removeAcademyMedia, uploadAcademyMedia } from '../../_lib/academy-media';

/**
 * The academy's own details, as a form.
 *
 * A dialog rather than a route because it is a short form opened from one place
 * and closed back to it — a manager fixing a phone number should not lose the
 * page they were reading, and the completion prompt that sent them here is
 * three lines above.
 *
 * The whole profile is submitted every time, including the fields nobody
 * touched. §7.2's audit record is what makes that safe: the service compares
 * before and after and records only what moved, so the history answers "what
 * did the manager change" rather than "what did the form send".
 *
 * A blank field clears the column. The contract normalizes an empty string to
 * null on the way in, so deleting a phone number in the form deletes it in the
 * academy rather than storing a blank that reads as an answer.
 */
export function AcademyProfileDialog({
  academy,
  onClose,
  open,
}: {
  academy: AcademyProfile;
  onClose: () => void;
  open: boolean;
}) {
  const { t } = useTranslation('manager');
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const headingId = React.useId();
  const panelRef = React.useRef<HTMLDivElement>(null);

  const [form, setForm] = React.useState(() => formFrom(academy));
  const [mediaKind, setMediaKind] = React.useState<'COVER' | 'GALLERY'>('COVER');
  const [altText, setAltText] = React.useState('');
  const [decorative, setDecorative] = React.useState(false);
  // Re-seeded when a fresh academy arrives, but only while closed: reseeding an
  // open form would discard whatever the manager is halfway through typing.
  const [seeded, setSeeded] = React.useState(academy.profileUpdatedAt);
  if (!open && seeded !== academy.profileUpdatedAt) {
    setSeeded(academy.profileUpdatedAt);
    setForm(formFrom(academy));
  }

  const save = useMutation({
    mutationFn: () =>
      orpc.academyOperationsProfile.update({
        academyId: academy.id,
        addressLine1: form.addressLine1 || null,
        addressLine2: form.addressLine2 || null,
        locality: form.locality || null,
        region: form.region || null,
        postalCode: form.postalCode || null,
        countryCode: form.countryCode || null,
        contactPhone: form.contactPhone || null,
        contactEmail: form.contactEmail || null,
        timeZone: form.timeZone,
      }),
    onSuccess: () => {
      // The overview owns every figure drawn from the profile — the plate, the
      // completion prompt, and the timezone every period is counted in — so the
      // page is re-read rather than patched from the mutation's own result.
      void queryClient.invalidateQueries({
        queryKey: ['academy-operations-overview', academy.id],
      });
      onClose();
    },
  });
  const refresh = () => queryClient.invalidateQueries({
    queryKey: ['academy-operations-overview', academy.id],
  });
  const uploadMedia = useMutation({
    mutationFn: (file: File) => uploadAcademyMedia({
      academyId: academy.id,
      kind: mediaKind,
      altText,
      decorative,
      file,
    }),
    onSuccess: async () => {
      setAltText('');
      setDecorative(false);
      await refresh();
    },
  });
  const deleteMedia = useMutation({
    mutationFn: (mediaId: string) => removeAcademyMedia({
      academyId: academy.id,
      mediaId,
    }),
    onSuccess: refresh,
  });

  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Focus enters the dialog rather than staying on the button behind it, so
    // a keyboard reader's next Tab is inside the form they just opened.
    panelRef.current?.querySelector('input')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 sm:items-center"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        aria-labelledby={headingId}
        aria-modal
        className="cove-pop w-full max-w-2xl rounded-modal border border-border bg-card shadow-[var(--shadow-modal)]"
        data-state="open"
        ref={panelRef}
        role="dialog"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-[16px] font-extrabold" id={headingId}>
              {t('profile_form.title')}
            </h2>
            <p className="mt-1 max-w-lg text-[12.5px] leading-[1.55] text-sub">
              {t('profile_form.description')}
            </p>
          </div>
          <button
            aria-label={t('profile_form.cancel')}
            className="grid size-8 shrink-0 place-items-center rounded-md text-sub transition-colors hover:bg-accent hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            onClick={onClose}
            type="button"
          >
            <X className="size-4" />
          </button>
        </header>

        <form
          className="px-5 py-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <fieldset className="mb-5 rounded-xl border border-border bg-accent/35 p-3.5">
            <legend className="px-1 text-[12px] font-extrabold text-ink">
              {t('profile_form.media_title')}
            </legend>
            <p className="mb-3 text-[11.5px] leading-[1.5] text-sub">
              {t('profile_form.media_description')}
            </p>

            {(academy.cover || academy.gallery.length > 0) ? (
              <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {[...(academy.cover ? [academy.cover] : []), ...academy.gallery].map((item) => (
                  <div className="group relative aspect-[3/2] overflow-hidden rounded-lg bg-accent" key={item.id}>
                    <img
                      alt={item.isDecorative ? '' : (item.altText ?? '')}
                      className="h-full w-full object-cover"
                      src={item.url}
                    />
                    <button
                      aria-label={t('profile_form.media_remove')}
                      className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-md bg-card/90 text-danger shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      disabled={deleteMedia.isPending}
                      onClick={() => deleteMedia.mutate(item.id)}
                      type="button"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-[8rem_1fr_auto] sm:items-end">
              <label className="flex flex-col gap-1 text-[12px] font-bold text-sub">
                {t('profile_form.media_kind')}
                <select
                  className="h-9 rounded-lg border border-border bg-card px-2.5 text-[13px] text-ink"
                  onChange={(event) => setMediaKind(event.target.value as 'COVER' | 'GALLERY')}
                  value={mediaKind}
                >
                  <option value="COVER">{t('profile_form.media_cover')}</option>
                  <option value="GALLERY">{t('profile_form.media_gallery')}</option>
                </select>
              </label>
              <Field
                disabled={decorative}
                label={t('profile_form.media_alt')}
                maxLength={300}
                onChange={setAltText}
                value={altText}
              />
              <label className="flex h-9 items-center gap-2 text-[12px] font-semibold text-sub">
                <input
                  checked={decorative}
                  onChange={(event) => setDecorative(event.target.checked)}
                  type="checkbox"
                />
                {t('profile_form.media_decorative')}
              </label>
            </div>
            <label className="mt-3 inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-brand px-3.5 text-[12.5px] font-bold text-on-brand focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
              <ImagePlus className="size-4" />
              {uploadMedia.isPending
                ? t('profile_form.media_uploading')
                : t('profile_form.media_upload')}
              <input
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={uploadMedia.isPending || (!decorative && !altText.trim())}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) uploadMedia.mutate(file);
                  event.target.value = '';
                }}
                type="file"
              />
            </label>
            {uploadMedia.isError || deleteMedia.isError ? (
              <p className="mt-2 text-[12px] font-semibold text-danger" role="alert">
                {errorText(uploadMedia.error ?? deleteMedia.error, t('profile_form.media_failed'))}
              </p>
            ) : null}
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              className="sm:col-span-2"
              label={t('profile_form.address_line1')}
              onChange={(value) => setForm({ ...form, addressLine1: value })}
              value={form.addressLine1}
            />
            <Field
              className="sm:col-span-2"
              label={t('profile_form.address_line2')}
              onChange={(value) => setForm({ ...form, addressLine2: value })}
              value={form.addressLine2}
            />
            <Field
              label={t('profile_form.locality')}
              onChange={(value) => setForm({ ...form, locality: value })}
              value={form.locality}
            />
            <Field
              label={t('profile_form.region')}
              onChange={(value) => setForm({ ...form, region: value })}
              value={form.region}
            />
            <Field
              label={t('profile_form.postal_code')}
              onChange={(value) => setForm({ ...form, postalCode: value })}
              value={form.postalCode}
            />
            <Field
              hint={t('profile_form.country_code_hint')}
              label={t('profile_form.country_code')}
              maxLength={2}
              onChange={(value) =>
                setForm({ ...form, countryCode: value.toUpperCase() })
              }
              value={form.countryCode}
            />
            <Field
              label={t('profile_form.contact_phone')}
              onChange={(value) => setForm({ ...form, contactPhone: value })}
              type="tel"
              value={form.contactPhone}
            />
            <Field
              label={t('profile_form.contact_email')}
              onChange={(value) => setForm({ ...form, contactEmail: value })}
              type="email"
              value={form.contactEmail}
            />
            <Field
              className="sm:col-span-2"
              hint={t('profile_form.time_zone_hint')}
              label={t('profile_form.time_zone')}
              onChange={(value) => setForm({ ...form, timeZone: value })}
              value={form.timeZone}
            />
          </div>

          {save.isError ? (
            <p
              className="mt-3 rounded-lg border border-danger/25 bg-danger/5 px-3 py-2 text-[12.5px] text-danger"
              role="alert"
            >
              {errorText(save.error, t('profile_form.failed'))}
            </p>
          ) : null}

          <div className="mt-4 flex justify-end gap-2 border-t border-border pt-4">
            <button
              className="h-9 rounded-lg px-3.5 text-[13px] font-bold text-sub transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              onClick={onClose}
              type="button"
            >
              {t('profile_form.cancel')}
            </button>
            <button
              className="h-9 rounded-lg bg-brand px-4 text-[13px] font-bold text-on-brand transition-opacity hover:opacity-90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              disabled={save.isPending}
              type="submit"
            >
              {save.isPending
                ? t('profile_form.saving')
                : t('profile_form.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  className,
  disabled,
  hint,
  label,
  maxLength,
  onChange,
  type = 'text',
  value,
}: {
  className?: string;
  disabled?: boolean;
  hint?: string;
  label: string;
  maxLength?: number;
  onChange: (value: string) => void;
  type?: string;
  value: string;
}) {
  const id = React.useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label className="text-[12px] font-bold text-sub" htmlFor={id}>
        {label}
      </label>
      <input
        aria-describedby={hintId}
        className="h-9 w-full rounded-lg border border-border bg-card px-3 text-[13.5px] outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
        id={id}
        disabled={disabled}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
      {hint ? (
        <p className="text-[11px] leading-[1.45] text-sub" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Nulls become empty strings so every input stays controlled. */
function formFrom(academy: AcademyProfile) {
  return {
    addressLine1: academy.addressLine1 ?? '',
    addressLine2: academy.addressLine2 ?? '',
    locality: academy.locality ?? '',
    region: academy.region ?? '',
    postalCode: academy.postalCode ?? '',
    countryCode: academy.countryCode ?? '',
    contactPhone: academy.contactPhone ?? '',
    contactEmail: academy.contactEmail ?? '',
    timeZone: academy.timeZone,
  };
}
