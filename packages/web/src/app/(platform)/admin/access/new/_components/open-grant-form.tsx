'use client';

import type { SupportAssumedRole } from '@cove/shared';
import {
  SUPPORT_GRANT_DEFAULT_HOURS,
  SUPPORT_GRANT_MAX_HOURS,
  supportAssumedRoles,
} from '@cove/shared';
import { Eye, PenLine } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/studio/button';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';
import { routes } from '@/lib/routes';

/**
 * The door into a customer's academy.
 *
 * Every control here is one of the four things that make deep access
 * defensible — who you act as, whether you can change anything, whether you can
 * watch a child work, and for how long — so the form *is* the policy rather
 * than a wrapper around it.
 *
 * The reason field comes first and is the widest thing on the page, because it
 * is the only part an academy will ever read. Submit stays disabled until it is
 * a sentence: a required field that accepts "fix" is not a required field.
 *
 * Read-only and one hour are the defaults. The narrow choice should be the one
 * that takes no thought, and the wide one should cost a deliberate click.
 */
export function OpenGrantForm({
  academyId,
  academyName,
  academySlug,
  next,
}: {
  academyId: string;
  academyName: string;
  academySlug: string;
  /**
   * Where to land once the session is open.
   *
   * Set when the operator arrived from a content row, so Edit takes them to
   * the course they clicked rather than to the academy's front door — the
   * session's clock is running, and making them navigate again spends it.
   *
   * Validated by the page, not trusted from here: an unchecked `next` is an
   * open redirect, and this one is reachable by anyone who can read the URL.
   */
  next?: string;
}) {
  const { t } = useTranslation('platform-support');
  const { t: console_ } = useTranslation('platform');
  const errorText = useErrorText();
  const router = useRouter();

  const [reason, setReason] = React.useState('');
  const [assumedRole, setAssumedRole] =
    React.useState<SupportAssumedRole>('MANAGER');
  const [readOnly, setReadOnly] = React.useState(true);
  const [allowMonitoring, setAllowMonitoring] = React.useState(false);
  const [hours, setHours] = React.useState(SUPPORT_GRANT_DEFAULT_HOURS);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);

  return (
    <form
      className="grid gap-6"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError(null);
        try {
          await orpc.platformSupport.open({
            academyId,
            assumedRole,
            readOnly,
            allowMonitoring,
            reason: reason.trim(),
            hours,
          });
          // Straight into the academy — to the exact page they came to change
          // when there is one. The session is open and its clock is running;
          // making the operator find their own way there would spend part of it
          // on navigation.
          router.push(next ?? routes.academy(academySlug));
        } catch (caught) {
          setError(caught);
          setPending(false);
        }
      }}
    >
      <Field
        hint={t('open.reason_hint')}
        htmlFor="grant-reason"
        label={t('open.reason_label')}
        required
      >
        <textarea
          className="min-h-24 w-full rounded-lg border border-border bg-card px-3 py-2 text-[14px] text-ink outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/30"
          id="grant-reason"
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
          value={reason}
        />
      </Field>

      <Field htmlFor="" label={t('open.role_label')}>
        <div className="grid gap-2 sm:grid-cols-2">
          {supportAssumedRoles.map((role) => (
            <Choice
              checked={assumedRole === role}
              description={
                role === 'MANAGER'
                  ? t('open.role_manager_hint')
                  : t('open.role_teacher_hint')
              }
              key={role}
              label={t(`role.${role}`)}
              name="assumed-role"
              onSelect={() => setAssumedRole(role)}
            />
          ))}
        </div>
      </Field>

      <Field htmlFor="" label={t('open.access_label')}>
        <div className="grid gap-2 sm:grid-cols-2">
          <Choice
            checked={readOnly}
            description={t('open.read_only_hint')}
            icon={Eye}
            label={t('open.read_only')}
            name="access"
            onSelect={() => {
              setReadOnly(true);
              // Monitoring is a write-shaped capability: it opens a live
              // channel into a student's editor. Silently keeping it ticked
              // under a read-only session would make "read-only" untrue.
              setAllowMonitoring(false);
            }}
          />
          <Choice
            checked={!readOnly}
            description={t('open.read_write_hint')}
            icon={PenLine}
            label={t('open.read_write')}
            name="access"
            onSelect={() => setReadOnly(false)}
            tone="warning"
          />
        </div>
      </Field>

      <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-card p-3.5">
        <input
          checked={allowMonitoring}
          className="mt-0.5 size-4 accent-[var(--brand)]"
          onChange={(event) => {
            setAllowMonitoring(event.target.checked);
            if (event.target.checked) setReadOnly(false);
          }}
          type="checkbox"
        />
        <span className="min-w-0">
          <span className="block text-[14px] font-bold text-ink">
            {t('open.monitoring_label')}
          </span>
          <span className="mt-0.5 block text-[13px] leading-6 text-sub">
            {t('open.monitoring_hint')}
          </span>
        </span>
      </label>

      <Field htmlFor="grant-hours" label={t('open.duration_label')}>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: SUPPORT_GRANT_MAX_HOURS }, (_, i) => i + 1).map(
            (value) => (
              <button
                aria-pressed={hours === value}
                className={`h-9 rounded-lg border px-3.5 text-[13.5px] font-bold transition-colors ${
                  hours === value
                    ? 'border-brand bg-brand-soft text-brand'
                    : 'border-border bg-card text-sub hover:border-brand hover:text-brand'
                }`}
                key={value}
                onClick={() => setHours(value)}
                type="button"
              >
                {t('open.duration_hours', { count: value })}
              </button>
            ),
          )}
        </div>
      </Field>

      {error ? (
        <p className="text-[13px] text-danger" role="alert">
          {errorText(error)}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-5">
        <Button
          disabled={pending}
          onClick={() => router.back()}
          type="button"
          variant="ghost"
        >
          {console_('create.cancel')}
        </Button>
        <Button
          disabled={pending || reason.trim().length < 12}
          type="submit"
          variant={readOnly ? 'default' : 'danger'}
        >
          {pending ? t('open.submitting') : t('open.submit')}
        </Button>
      </div>

      <p className="sr-only">{academyName}</p>
    </form>
  );
}

function Field({
  label,
  hint,
  htmlFor,
  required = false,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <label
        className="text-[13.5px] font-bold text-ink"
        htmlFor={htmlFor || undefined}
      >
        {label}
        {required ? <span className="ml-1 text-danger">*</span> : null}
      </label>
      {children}
      {hint ? <p className="text-[12.5px] text-sub">{hint}</p> : null}
    </div>
  );
}

function Choice({
  checked,
  description,
  icon: Icon,
  label,
  name,
  onSelect,
  tone = 'brand',
}: {
  checked: boolean;
  description: string;
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  name: string;
  onSelect: () => void;
  tone?: 'brand' | 'warning';
}) {
  const active =
    tone === 'warning'
      ? 'border-warning bg-warning/5'
      : 'border-brand bg-brand-soft';
  return (
    <label
      className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3.5 transition-colors ${
        checked ? active : 'border-border bg-card hover:border-brand/50'
      }`}
    >
      <input
        checked={checked}
        className="mt-0.5 size-4 accent-[var(--brand)]"
        name={name}
        onChange={onSelect}
        type="radio"
      />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-[14px] font-bold text-ink">
          {Icon ? <Icon className="size-3.5 shrink-0" /> : null}
          {label}
        </span>
        <span className="mt-0.5 block text-[13px] leading-6 text-sub">
          {description}
        </span>
      </span>
    </label>
  );
}
