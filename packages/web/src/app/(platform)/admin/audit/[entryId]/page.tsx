import { formatShortDateTime } from '@cove/i18n/format';
import { notFound } from 'next/navigation';
import Link from 'next/link';

import { BackLink } from '@/components/studio/back-link';
import { getServerTranslation } from '@/i18n/server/get-server-translation';
import { getLocale } from '@/i18n/server/get-locale';
import { createServerORPCClient } from '@/lib/orpc-server';
import { routes } from '@/lib/routes';

import { PlatformShell } from '../../_components/platform-shell';

/**
 * One record, in full.
 *
 * `before` and `after` are printed as stored rather than rendered per action.
 * Every feature writes its own shape, and a per-action renderer would be a
 * switch statement that silently stops covering the newest feature — which is
 * exactly the record somebody is here to read.
 */
export default async function AuditEntryPage({
  params,
}: {
  params: Promise<{ entryId: string }>;
}) {
  const { entryId } = await params;
  const { t } = await getServerTranslation(['platform-audit']);
  const locale = await getLocale();

  const entry = await createServerORPCClient()
    .platformAudit.get({ entryId })
    .catch(() => null);
  if (!entry) notFound();

  return (
    <PlatformShell
      back={<BackLink href="/admin/audit" label={t('back')} />}
      bleed
      description={formatShortDateTime(entry.createdAt, locale)}
      title={entry.action}
    >
      <div className="grid gap-4">
        <section className="rounded-card border border-border bg-card p-5">
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Field label={t('field.actor')}>
              {entry.actorUserId ? (
                <Link
                  className="text-brand hover:underline"
                  href={`/admin/users/${entry.actorUserId}`}
                >
                  {entry.actorName ?? t('actor_unknown')}
                </Link>
              ) : (
                (entry.actorName ?? t('actor_unknown'))
              )}
            </Field>
            <Field label={t('field.academy')}>
              {entry.academySlug ? (
                <Link
                  className="text-brand hover:underline"
                  href={routes.adminAcademy(entry.academySlug)}
                >
                  {entry.academyName}
                </Link>
              ) : (
                t('platform_wide')
              )}
            </Field>
            <Field label={t('field.target')}>
              <span className="font-mono text-[13px]">
                {entry.targetType}
                {entry.targetId ? ` · ${entry.targetId}` : ''}
              </span>
            </Field>
            <Field label={t('field.request')}>
              <span className="font-mono text-[13px]">
                {entry.requestId ?? '—'}
              </span>
            </Field>
            {entry.supportGrantId ? (
              <Field label={t('field.support')}>
                <Link
                  className="text-warning hover:underline"
                  href={`/admin/access/${entry.supportGrantId}`}
                >
                  {t('support_marker')}
                </Link>
              </Field>
            ) : null}
          </dl>

          {entry.reason ? (
            <blockquote className="mt-4 rounded-lg border-l-2 border-brand bg-muted/60 px-3.5 py-2.5 text-[14px] leading-6 text-ink">
              {entry.reason}
            </blockquote>
          ) : null}
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Snapshot label={t('field.before')} value={entry.before} />
          <Snapshot label={t('field.after')} value={entry.after} />
        </div>
      </div>
    </PlatformShell>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] font-semibold uppercase tracking-wide text-sub">
        {label}
      </dt>
      <dd className="mt-0.5 break-words text-[14px] text-ink">{children}</dd>
    </div>
  );
}

function Snapshot({ label, value }: { label: string; value: unknown }) {
  return (
    <section className="rounded-card border border-border bg-card p-4">
      <h2 className="text-[12px] font-semibold uppercase tracking-wide text-sub">
        {label}
      </h2>
      {/* Its own scroll container: a wide record must not make the page scroll
          sideways. */}
      <pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-3 font-mono text-[12.5px] leading-6 text-ink">
        {value === null || value === undefined
          ? '—'
          : JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}
