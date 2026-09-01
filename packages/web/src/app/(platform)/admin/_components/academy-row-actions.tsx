'use client';

import type { AcademyStatus, PlatformAcademySummary } from '@cove/shared';
import { canTransitionAcademyStatus } from '@cove/shared';
import {
  Archive,
  ArrowRight,
  MoreHorizontal,
  PlayCircle,
  PauseCircle,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/studio/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/studio/overlays';
import { Modal, ModalContent } from '@/components/studio/primitives';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';
import { routes } from '@/lib/routes';

/**
 * What an operator can do to an academy without opening it.
 *
 * Open stays a button because it is what nearly every row is clicked for; the
 * rest live behind the menu, which is what keeps a destructive action off the
 * end of a row somebody is scanning quickly.
 *
 * Suspend and restore and archive are transitions, and the menu offers only the
 * ones this academy can actually make — `canTransitionAcademyStatus` is the
 * same rule the API enforces, so a disabled-looking option never appears at
 * all. Delete is not a transition and is not offered beside them: it sits under
 * a separator, in danger, at the bottom.
 */
export function AcademyRowActions({
  academy,
}: {
  academy: PlatformAcademySummary;
}) {
  const { t } = useTranslation('platform');
  const router = useRouter();

  const [target, setTarget] = React.useState<AcademyStatus | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const transitions = (['SUSPENDED', 'ACTIVE', 'ARCHIVED'] as const).filter(
    (next) => canTransitionAcademyStatus(academy.status, next),
  );

  const icons: Record<AcademyStatus, React.ComponentType<{ className?: string }>> = {
    ACTIVE: PlayCircle,
    SUSPENDED: PauseCircle,
    ARCHIVED: Archive,
  };
  const labels: Record<AcademyStatus, string> = {
    ACTIVE: t('detail.restore'),
    SUSPENDED: t('detail.suspend'),
    ARCHIVED: t('detail.archive'),
  };
  const tones: Record<AcademyStatus, string> = {
    ACTIVE: 'text-success',
    SUSPENDED: 'text-warning',
    ARCHIVED: 'text-sub',
  };

  return (
    <div
      className="flex items-center justify-end gap-1.5"
      onClick={(event) => event.stopPropagation()}
    >
      <Link
        className="group inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg bg-brand-soft px-3.5 text-[13.5px] font-bold text-brand transition-colors hover:bg-brand hover:text-on-brand"
        href={routes.adminAcademy(academy.slug)}
      >
        {t('table.open')}
        <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </Link>

      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t('table.more')}
          className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-card text-sub transition-colors hover:border-brand hover:text-brand data-[state=open]:border-brand data-[state=open]:text-brand"
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {transitions.map((next) => {
            const Icon = icons[next];
            return (
              <DropdownMenuItem
                key={next}
                onSelect={(event) => {
                  event.preventDefault();
                  setTarget(next);
                }}
              >
                <Icon className={`size-4 ${tones[next]}`} />
                {labels[next]}
              </DropdownMenuItem>
            );
          })}
          {transitions.length > 0 ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setDeleting(true);
            }}
          >
            <Trash2 className="size-4 text-danger" />
            <span className="text-danger">{t('delete.action')}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <LifecycleDialog
        academy={academy}
        onDone={() => {
          setTarget(null);
          router.refresh();
        }}
        target={target}
      />
      <DeleteDialog
        academy={academy}
        onClose={() => setDeleting(false)}
        onDone={() => {
          setDeleting(false);
          router.refresh();
        }}
        open={deleting}
      />
    </div>
  );
}

/* ------------------------------------------------------------- lifecycle */

function LifecycleDialog({
  academy,
  onDone,
  target,
}: {
  academy: PlatformAcademySummary;
  onDone: () => void;
  target: AcademyStatus | null;
}) {
  const { t } = useTranslation('platform');
  const errorText = useErrorText();
  const [reason, setReason] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);

  const titles: Record<AcademyStatus, string> = {
    ACTIVE: t('detail.confirm_restore_title', { name: academy.name }),
    SUSPENDED: t('detail.confirm_suspend_title', { name: academy.name }),
    ARCHIVED: t('detail.confirm_archive_title', { name: academy.name }),
  };
  const bodies: Record<AcademyStatus, string> = {
    ACTIVE: t('detail.confirm_restore_body'),
    SUSPENDED: t('detail.confirm_suspend_body'),
    ARCHIVED: t('detail.confirm_archive_body'),
  };

  return (
    <Modal onOpenChange={(next) => (next ? null : onDone())} open={Boolean(target)}>
      <ModalContent
        description={target ? bodies[target] : ''}
        title={target ? titles[target] : ''}
      >
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (!target) return;
            setPending(true);
            setError(null);
            try {
              await orpc.platformAcademies.setStatus({
                academyId: academy.id,
                status: target,
                reason: reason.trim(),
              });
              setReason('');
              onDone();
            } catch (caught) {
              setError(caught);
            } finally {
              setPending(false);
            }
          }}
        >
          <ReasonField onChange={setReason} value={reason} />
          {error ? (
            <p className="px-6 pb-1 text-[13px] text-danger" role="alert">
              {errorText(error)}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
            <Button disabled={pending} onClick={onDone} type="button" variant="ghost">
              {t('create.cancel')}
            </Button>
            <Button
              disabled={pending || reason.trim().length < 3}
              type="submit"
              variant={target === 'ACTIVE' ? 'default' : 'danger'}
            >
              {pending ? t('detail.working') : t('detail.confirm')}
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
}

/* ---------------------------------------------------------------- delete */

/**
 * The only irreversible thing on this page.
 *
 * Two locks rather than one: a reason, as every lifecycle change takes, and the
 * academy's slug typed back. There is no undo and no archive to restore from,
 * so the confirmation has to be something nobody performs by accident — and a
 * second button never is.
 *
 * The dialog says what goes, in numbers, because "delete this academy" does not
 * convey twenty-eight people and five hundred problems.
 */
function DeleteDialog({
  academy,
  onClose,
  onDone,
  open,
}: {
  academy: PlatformAcademySummary;
  onClose: () => void;
  onDone: () => void;
  open: boolean;
}) {
  const { t } = useTranslation('platform');
  const errorText = useErrorText();
  const [reason, setReason] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);

  const confirmed = slug.trim().toLowerCase() === academy.slug;

  return (
    <Modal onOpenChange={(next) => (next ? null : onClose())} open={open}>
      <ModalContent
        description={t('delete.body', { name: academy.name })}
        title={t('delete.title', { name: academy.name })}
      >
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setPending(true);
            setError(null);
            try {
              await orpc.platformAcademies.delete({
                academyId: academy.id,
                confirmSlug: slug.trim(),
                reason: reason.trim(),
              });
              setReason('');
              setSlug('');
              onDone();
            } catch (caught) {
              setError(caught);
            } finally {
              setPending(false);
            }
          }}
        >
          <div className="grid gap-3 px-6 py-5">
            <p className="rounded-lg border border-danger/25 bg-danger/5 px-3.5 py-3 text-[13px] leading-6 text-ink">
              {t('delete.stakes', {
                people: academy.memberCounts.total,
                name: academy.name,
              })}
            </p>

            <div className="grid gap-1.5">
              <label className="text-[13.5px] font-bold text-ink" htmlFor="delete-slug">
                {t('delete.confirm_label', { slug: academy.slug })}
                <span className="ml-1 text-danger">*</span>
              </label>
              <input
                autoComplete="off"
                className="h-10 w-full rounded-lg border border-border bg-card px-3 font-mono text-[14px] text-ink outline-none focus-visible:border-danger focus-visible:ring-2 focus-visible:ring-danger/30"
                id="delete-slug"
                onChange={(event) => setSlug(event.target.value)}
                value={slug}
              />
            </div>

            <ReasonField bare onChange={setReason} value={reason} />

            {error ? (
              <p className="text-[13px] text-danger" role="alert">
                {errorText(error)}
              </p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
            <Button disabled={pending} onClick={onClose} type="button" variant="ghost">
              {t('create.cancel')}
            </Button>
            <Button
              disabled={pending || !confirmed || reason.trim().length < 8}
              type="submit"
              variant="danger"
            >
              {pending ? t('delete.working') : t('delete.confirm')}
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
}

function ReasonField({
  bare = false,
  onChange,
  value,
}: {
  bare?: boolean;
  onChange: (value: string) => void;
  value: string;
}) {
  const { t } = useTranslation('platform');
  return (
    <div className={bare ? 'grid gap-1.5' : 'grid gap-1.5 px-6 py-5'}>
      <label className="text-[13.5px] font-bold text-ink" htmlFor="row-reason">
        {t('detail.reason_label')}
        <span className="ml-1 text-danger">*</span>
      </label>
      <textarea
        className="min-h-20 w-full rounded-lg border border-border bg-card px-3 py-2 text-[14px] text-ink outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/30"
        id="row-reason"
        maxLength={500}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
      <p className="text-[12.5px] text-sub">{t('detail.reason_hint')}</p>
    </div>
  );
}
