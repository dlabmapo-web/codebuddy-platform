'use client';

import { useCallback, useState } from 'react';
import { Info, KeyRound, Mail } from 'lucide-react';
import { locales, type Locale } from '@cove/i18n/settings';
import { formatDateTime } from '@cove/i18n/format';
import {
  formatPhoneForDisplay,
  profileLocales,
  type MyProfileResponse,
  type ProfileLocale,
} from '@cove/shared';

import { Button } from '@/components/studio/button';
import { Input } from '@/components/studio/primitives';
import { useLocale } from '@/i18n';
import { useTranslation } from 'react-i18next';
import { setBrowserLocale } from '@/i18n/client/set-locale';
import { orpc } from '@/lib/orpc';
import { createClient } from '@/lib/supabase/client';
import { themes, type Theme } from '@/lib/theme/settings';
import { useTheme } from '@/lib/theme/theme-provider';

import { useProfileSection } from '@/components/studio/profile/use-profile-section';
import { Field, FieldRow, ReadOnlyField, TextField } from '@/components/studio/profile/fields';
import { SectionCard } from '@/components/studio/profile/section-card';
import { avatarSourceOf } from '@/components/studio/profile-avatar';
import { ImagePicker } from './image-picker';
import {
  changePassword,
  validatePasswordChange,
  type PasswordChangeIssue,
} from '../_lib/change-password';

/**
 * The account zone: everything that belongs to the person rather than to an
 * academy.
 *
 * Deliberately not accented. The academy sections above take the colour of a
 * role; these do not, because global identity belongs to no academy and a page
 * that tinted them the same way would be making the opposite claim to the one
 * the product enforces.
 */
export function AccountSections({
  profile,
  onSaved,
  globalImage,
}: {
  profile: MyProfileResponse;
  onSaved: (response: MyProfileResponse) => void;
  globalImage: {
    pending: boolean;
    error: unknown;
    onSelect: (file: File) => Promise<unknown>;
    onRemove: () => void;
  } | null;
}) {
  return (
    <>
      {globalImage ? (
        <GlobalPhotoSection image={globalImage} profile={profile} />
      ) : null}
      <AccountSection onSaved={onSaved} profile={profile} />
      <PreferencesSection onSaved={onSaved} profile={profile} />
      <SecuritySection profile={profile} />
    </>
  );
}

function GlobalPhotoSection({
  profile,
  image,
}: {
  profile: MyProfileResponse;
  image: {
    pending: boolean;
    error: unknown;
    onSelect: (file: File) => Promise<unknown>;
    onRemove: () => void;
  };
}) {
  const { t } = useTranslation('profile');
  const name = profile.profile.displayName ??
    profile.profile.username ??
    profile.profile.email ??
    '';
  const avatar = {
    globalImageUrl: profile.profile.image?.url ?? null,
    externalAvatarUrl: profile.profile.externalAvatarUrl,
    name,
  };

  return (
    <section className="rounded-card border border-border bg-card px-6 py-5">
      <div className="mb-5">
        <h2 className="text-[16px] font-extrabold tracking-[-0.02em]">
          {t('section.global_photo.title')}
        </h2>
        <p className="mt-1.5 text-[13px] leading-[1.6] text-sub">
          {t('section.global_photo.description')}
        </p>
      </div>
      <ImagePicker
        avatar={avatar}
        canRemove={Boolean(profile.profile.image)}
        error={image.error}
        name={name}
        onRemove={image.onRemove}
        onSelect={image.onSelect}
        pending={image.pending}
        sourceKind={avatarSourceOf(avatar).kind}
      />
    </section>
  );
}

function AccountSection({
  profile,
  onSaved,
}: {
  profile: MyProfileResponse;
  onSaved: (response: MyProfileResponse) => void;
}) {
  const { t } = useTranslation('profile');
  const section = useProfileSection(
    {
      displayName: profile.profile.displayName ?? '',
      contactPhone: profile.profile.contactPhone ?? '',
    },
    profile.profile.updatedAt,
    useCallback(
      async (draft, expectedUpdatedAt) =>
        onSaved(
          await orpc.profile.updateGlobalProfile({
            displayName: draft.displayName,
            contactPhone: draft.contactPhone,
            expectedUpdatedAt: expectedUpdatedAt!,
          }),
        ),
      [onSaved],
    ),
  );

  return (
    <SectionCard
      description={t('section.account.description')}
      owner="you"
      section={section}
      title={t('section.account.title')}
    >
      <FieldRow>
        <TextField
          label={t('field.display_name')}
          maxLength={60}
          onChange={(value) => section.set({ displayName: value })}
          value={section.draft.displayName}
        />
        <TextField
          help={t('field.contact_phone_help')}
          inputMode="tel"
          label={t('field.contact_phone')}
          maxLength={32}
          onChange={(value) => section.set({ contactPhone: value })}
          optional={t('field.optional')}
          value={section.draft.contactPhone}
        />
      </FieldRow>
      <FieldRow>
        <ReadOnlyField
          emptyLabel={t('field.none')}
          help={t('field.username_help')}
          label={t('field.username')}
          value={profile.profile.username}
        />
        <ReadOnlyField
          emptyLabel={t('field.none')}
          label={t('field.platform_role')}
          value={t(`platform_role.${profile.profile.platformRole}`)}
        />
      </FieldRow>
      {profile.profile.contactPhone ? (
        <p className="text-[12.5px] text-sub/85">
          {formatPhoneForDisplay(profile.profile.contactPhone)}
        </p>
      ) : null}
    </SectionCard>
  );
}

/**
 * Language and time zone are stored on the account. Theme is not: it is
 * resolved from a cookie before any JavaScript runs, which is the only way a
 * dark-mode reader avoids a white flash on every page load.
 */
function PreferencesSection({
  profile,
  onSaved,
}: {
  profile: MyProfileResponse;
  onSaved: (response: MyProfileResponse) => void;
}) {
  const { t } = useTranslation('profile');
  const { theme, setTheme } = useTheme();
  const activeLocale = useLocale();

  const section = useProfileSection(
    {
      preferredLocale: profile.profile.preferredLocale,
      timezone: profile.profile.timezone ?? '',
    },
    profile.profile.updatedAt,
    useCallback(
      async (draft, expectedUpdatedAt) => {
        const response = await orpc.profile.updatePreferences({
          preferredLocale: draft.preferredLocale,
          timezone: draft.timezone,
          expectedUpdatedAt: expectedUpdatedAt!,
        });
        // The stored preference and the browser's cookie are two different
        // things; saving one without the other would leave the reader on a
        // language they just changed away from.
        if (draft.preferredLocale !== activeLocale) {
          setBrowserLocale(draft.preferredLocale as Locale);
        }
        onSaved(response);
      },
      [activeLocale, onSaved],
    ),
  );

  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <SectionCard
      description={t('section.preferences.description')}
      owner="you"
      section={section}
      title={t('section.preferences.title')}
    >
      <FieldRow>
        <Field htmlFor="profile-locale" label={t('field.preferred_locale')}>
          <select
            className={selectClass}
            id="profile-locale"
            onChange={(event) =>
              section.set({
                preferredLocale: event.target.value as ProfileLocale,
              })}
            value={section.draft.preferredLocale}
          >
            {profileLocales
              .filter((locale) => (locales as readonly string[]).includes(locale))
              .map((locale) => (
                <option key={locale} value={locale}>
                  {t(`locale.${locale}`)}
                </option>
              ))}
          </select>
        </Field>
        <Field htmlFor="profile-theme" label={t('field.theme')}>
          {/* Applied immediately and not part of the save: a theme you have to
              confirm is a theme you evaluate in the wrong colours. */}
          <select
            className={selectClass}
            id="profile-theme"
            onChange={(event) => setTheme(event.target.value as Theme)}
            value={theme}
          >
            {themes.map((option) => (
              <option key={option} value={option}>
                {t(`theme.${option}`)}
              </option>
            ))}
          </select>
        </Field>
      </FieldRow>
      <div className="space-y-2">
        <TextField
          help={t('field.timezone_help')}
          label={t('field.timezone')}
          maxLength={64}
          onChange={(value) => section.set({ timezone: value })}
          optional={t('field.optional')}
          placeholder={browserZone}
          value={section.draft.timezone}
        />
        {section.draft.timezone ? (
          <Button
            onClick={() => section.set({ timezone: '' })}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t('field.timezone_reset')}
          </Button>
        ) : null}
      </div>
    </SectionCard>
  );
}

const selectClass =
  'h-10 w-full rounded-lg border border-border bg-card px-3 text-[14px] text-ink outline-none transition-colors focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20';

/**
 * Credentials, and only what Cove can genuinely do about them today.
 *
 * Password and email changes go straight to Supabase Auth, which owns the
 * identity: a Cove endpoint in front of them would add a hop and no authority.
 * Session revocation and phone verification are not built yet, so they are
 * stated as facts rather than rendered as controls that do nothing.
 */
function SecuritySection({ profile }: { profile: MyProfileResponse }) {
  const { t } = useTranslation('profile');
  const locale = useLocale();
  const { security } = profile;

  return (
    <SectionCard
      description={t('section.security.description')}
      owner="you"
      title={t('section.security.title')}
    >
      <EmailControl
        email={profile.profile.email}
        verified={security.emailVerified}
      />
      {security.hasPasswordIdentity ? (
        <PasswordControl />
      ) : (
        <p className="flex gap-2.5 rounded-lg border border-border bg-muted/60 px-4 py-3 text-[13.5px] leading-[1.6] text-sub">
          <KeyRound aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
          {t('security.password_none')}
        </p>
      )}

      <ReadOnlyField
        emptyLabel={t('security.providers_none')}
        label={t('security.providers')}
        value={
          security.connectedProviders.length > 0
            ? security.connectedProviders.join(', ')
            : null
        }
      />

      <div className="space-y-2 rounded-lg border border-border bg-muted/60 px-4 py-3">
        <p className="flex gap-2.5 text-[13.5px] leading-[1.6] text-sub">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
          {t('security.sessions_unavailable')}
        </p>
        {security.lastSignInAt ? (
          <p className="pl-6.5 text-[12.5px] text-sub/85">
            {t('security.last_sign_in', {
              date: formatDateTime(security.lastSignInAt, locale),
            })}
          </p>
        ) : null}
        {!security.phoneVerificationAvailable && profile.profile.contactPhone ? (
          <p className="pl-6.5 text-[12.5px] text-sub/85">
            {t('security.phone_unverified')}
          </p>
        ) : null}
      </div>
    </SectionCard>
  );
}

function EmailControl({
  email,
  verified,
}: {
  email: string | null;
  verified: boolean;
}) {
  const { t } = useTranslation('profile');
  const [open, setOpen] = useState(false);
  const [next, setNext] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    setFailed(false);
    const { error } = await createClient().auth.updateUser({ email: next });
    setPending(false);
    if (error) {
      setFailed(true);
      setMessage(t('security.email_failed'));
      return;
    }
    setMessage(t('security.email_sent', { email: next }));
    setOpen(false);
    setNext('');
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <ReadOnlyField
            emptyLabel={t('field.none')}
            label={t('field.email')}
            value={
              <span className="flex flex-wrap items-center gap-2">
                <span className="truncate">{email}</span>
                <span
                  className={
                    verified
                      ? 'rounded-full bg-success/12 px-2 py-0.5 text-[11.5px] font-bold uppercase tracking-[0.06em] text-success'
                      : 'rounded-full bg-warning/12 px-2 py-0.5 text-[11.5px] font-bold uppercase tracking-[0.06em] text-warning'
                  }
                >
                  {verified
                    ? t('security.email_verified')
                    : t('security.email_unverified')}
                </span>
              </span>
            }
          />
        </div>
        <Button
          onClick={() => setOpen((current) => !current)}
          size="sm"
          type="button"
          variant="outline"
        >
          <Mail aria-hidden strokeWidth={2} />
          {t('security.change_email')}
        </Button>
      </div>

      {open ? (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/60 px-4 py-3">
          <div className="min-w-56 flex-1">
            <Field htmlFor="profile-new-email" label={t('security.new_email')}>
              <Input
                autoComplete="email"
                id="profile-new-email"
                onChange={(event) => setNext(event.target.value)}
                type="email"
                value={next}
              />
            </Field>
          </div>
          <Button
            disabled={pending || next.length < 5}
            onClick={() => void submit()}
            size="sm"
            type="button"
          >
            {t('security.change_email')}
          </Button>
        </div>
      ) : null}

      {message ? (
        <p
          className={
            failed
              ? 'text-[13px] font-semibold text-danger'
              : 'text-[13px] text-success'
          }
          role="status"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

function PasswordControl() {
  const { t } = useTranslation('profile');
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<'success' | 'warning' | 'danger'>('success');
  const [pending, setPending] = useState(false);

  async function submit() {
    const input = { currentPassword, newPassword, confirmation };
    const validation = validatePasswordChange(input);
    if (validation) {
      setTone('danger');
      setMessage(t(passwordIssueKey(validation)));
      return;
    }

    setPending(true);
    setMessage(null);
    const result = await changePassword(createClient().auth, input);
    setPending(false);

    if (!result.changed) {
      setTone('danger');
      setMessage(t(passwordIssueKey(result.issue)));
      return;
    }

    /*
     * The password Cove was holding for this account, if any, is now wrong.
     *
     * A student's manager can read back the password they issued, and the one
     * thing that makes that defensible is that Cove destroys it the moment its
     * owner replaces it — which is here, because a student has no email and so
     * no recovery link can change a password behind Cove's back.
     *
     * Deliberately not blocking and deliberately silent. The password has
     * already changed; reporting a failure here would tell somebody their
     * change did not work when it did. A stale row is caught anyway, because
     * revealing it hands the manager a password that no longer signs anybody in.
     */
    void orpc.auth.forgetIssuedPassword({}).catch(() => undefined);

    setOpen(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmation('');
    setTone(result.otherSessionsRevoked ? 'success' : 'warning');
    setMessage(t(
      result.otherSessionsRevoked
        ? 'security.password_changed'
        : 'security.password_sessions_failed',
    ));
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
        <p className="text-[13.5px] text-sub">{t('security.password_set')}</p>
        <Button
          onClick={() => {
            setOpen((current) => !current);
            setMessage(null);
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          <KeyRound aria-hidden strokeWidth={2} />
          {t('security.change_password')}
        </Button>
      </div>

      {open ? (
        <div className="space-y-3 rounded-lg border border-border bg-muted/60 px-4 py-3">
          <Field
            htmlFor="profile-current-password"
            label={t('security.current_password')}
          >
            <Input
              autoComplete="current-password"
              id="profile-current-password"
              onChange={(event) => setCurrentPassword(event.target.value)}
              type="password"
              value={currentPassword}
            />
          </Field>
          <FieldRow>
            <Field
              htmlFor="profile-new-password"
              label={t('security.new_password')}
            >
              <Input
                autoComplete="new-password"
                id="profile-new-password"
                minLength={8}
                onChange={(event) => setNewPassword(event.target.value)}
                type="password"
                value={newPassword}
              />
            </Field>
            <Field
              htmlFor="profile-confirm-password"
              label={t('security.confirm_password')}
            >
              <Input
                autoComplete="new-password"
                id="profile-confirm-password"
                minLength={8}
                onChange={(event) => setConfirmation(event.target.value)}
                type="password"
                value={confirmation}
              />
            </Field>
          </FieldRow>
          <Button
            disabled={
              pending ||
              currentPassword.length === 0 ||
              newPassword.length === 0 ||
              confirmation.length === 0
            }
            onClick={() => void submit()}
            size="sm"
            type="button"
          >
            {t('security.change_password')}
          </Button>
        </div>
      ) : null}

      {message ? (
        <p
          className={
            tone === 'danger'
              ? 'text-[13px] font-semibold text-danger'
              : tone === 'warning'
              ? 'text-[13px] font-semibold text-warning'
              : 'text-[13px] text-success'
          }
          role={tone === 'danger' ? 'alert' : 'status'}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

function passwordIssueKey(issue: PasswordChangeIssue) {
  const keys = {
    CURRENT_REQUIRED: 'security.current_password_required',
    NEW_REQUIRED: 'security.new_password_required',
    TOO_SHORT: 'security.password_too_short',
    SAME_PASSWORD: 'security.password_same',
    MISMATCH: 'security.password_mismatch',
    CURRENT_INCORRECT: 'security.current_password_incorrect',
    WEAK_PASSWORD: 'security.password_weak',
    RATE_LIMITED: 'security.password_rate_limited',
    CHANGE_FAILED: 'security.password_failed',
  } as const;
  return keys[issue];
}
