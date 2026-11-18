'use client';

import type {
  LibraryReleaseDraft,
  LibrarySyncCopy,
} from '@cove/shared';
import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/studio/button';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';

/**
 * Publish update, and where each academy copy stands (library sync design §18.1).
 *
 * Head office keeps editing the master freely; nothing reaches an academy
 * until this button records a release. The copies list is counts and states
 * only — never an academy's content.
 */
export function LibraryReleasePanel({
  courseId,
  initialDraft,
  initialCopies,
}: {
  courseId: string;
  initialDraft: LibraryReleaseDraft;
  initialCopies: LibrarySyncCopy[];
}) {
  const { t } = useTranslation('platform-library');
  const errorText = useErrorText();
  const [draft, setDraft] = React.useState<LibraryReleaseDraft | null>(
    initialDraft,
  );
  const [copies, setCopies] = React.useState<LibrarySyncCopy[] | null>(
    initialCopies,
  );
  const queryClient = useQueryClient();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const [nextDraft, nextCopies] = await Promise.all([
        orpc.platformLibrarySync.draft({ courseId }),
        orpc.platformLibrarySync.copies({ courseId }),
      ]);
      setDraft(nextDraft);
      setCopies(nextCopies.copies);
    } catch (caught) {
      setError(caught);
    }
  }, [courseId]);

  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    // Saved outline changes refresh the batch summary, without polling.
    const unsubscribe = queryClient.getQueryCache().subscribe(event => {
      const key = event.query.queryKey;
      if (event.type === 'updated' && event.action.type === 'success' &&
        key[0] === 'academy' && key[2] === 'course' && key[3] === courseId && key[4] === 'outline') {
        clearTimeout(timer);
        timer = setTimeout(() => void load(), 250);
      }
    });
    return () => { clearTimeout(timer); unsubscribe(); window.removeEventListener('focus', onFocus); };
  }, [load, queryClient, courseId]);

  async function publish() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await orpc.platformLibrarySync.publish({
        courseId,
        note: '',
        expectedContentRevision: draft.contentRevision,
      });
      setNotice(t('sync.batch_published'));
      await load();
    } catch (caught) {
      setError(caught);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function act(
    action: 'retry' | 'pause' | 'resume',
    copyCourseId: string,
  ) {
    setError(null);
    try {
      const updated = await orpc.platformLibrarySync[action]({ copyCourseId });
      setCopies(
        (current) =>
          current?.map((copy) =>
            copy.courseId === copyCourseId ? updated : copy,
          ) ?? null,
      );
    } catch (caught) {
      setError(caught);
    }
  }

  const changes = draft
    ? draft.summary.added + draft.summary.removed + draft.summary.changed
    : 0;

  return (
    <section
      className="mb-6 rounded-card border border-border bg-card p-5"
      aria-labelledby="library-release-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2
            className="text-[16px] font-bold text-ink"
            id="library-release-heading"
          >
            {t('sync.heading')}
          </h2>
          <p className="mt-1 max-w-xl text-[13.5px] text-sub">{t('sync.batch_help')}</p>
          {draft ? (
            <p className="mt-1 text-[13.5px] font-semibold text-ink">
              {changes > 0
                  ? t('sync.changes', draft.summary)
                  : t('sync.no_changes')}
            </p>
          ) : null}
          {draft?.blockers.length ? (
            <p
              className="mt-1 text-[13px] font-semibold text-danger"
              role="alert"
            >
              {t('sync.blockers', { list: draft.blockers.join(', ') })}
            </p>
          ) : null}
        </div>
        <div className="flex w-full max-w-md flex-col gap-2 sm:w-auto">
          <Button
            disabled={
              busy ||
              !draft ||
              !draft.hasUnpublishedChanges ||
              draft.blockers.length > 0
            }
            onClick={() => void publish()}
            type="button"
          >
            {busy ? t('sync.publishing') : t('sync.publish')}
          </Button>
        </div>
      </div>

      {notice ? (
        <p
          className="mt-3 rounded-lg bg-brand-soft px-3 py-2 text-[13.5px] font-semibold text-brand"
          role="status"
        >
          {notice}
        </p>
      ) : null}
      {error ? (
        <p
          className="mt-3 text-[13.5px] font-semibold text-danger"
          role="alert"
        >
          {errorText(error)}
        </p>
      ) : null}

      <details className="mt-4 border-t border-border pt-3">
      <summary className="cursor-pointer text-[13px] font-semibold text-sub">
        {t('sync.copies_heading')}
      </summary>
      {copies && copies.length === 0 ? (
        <p className="mt-2 text-[13.5px] text-sub">{t('sync.copies_empty')}</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {(copies ?? []).map((copy) => (
            <li
              className="flex flex-wrap items-center gap-3 py-2.5"
              key={copy.courseId}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-bold text-ink">
                  {copy.academyName}
                </p>
                <p className="truncate text-[13px] text-sub">
                  {copy.courseTitle}
                </p>
                {copy.lastRunAt ? (
                  <time
                    className="text-[12px] text-sub"
                    dateTime={copy.lastRunAt}
                  >
                    {t('sync.last_run', {
                      date: copy.lastRunAt.slice(0, 16).replace('T', ' '),
                    })}
                  </time>
                ) : null}
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-[12.5px] font-bold ${
                  copy.status === 'FAILED'
                    ? 'bg-danger/10 text-danger'
                    : copy.status === 'IDLE'
                      ? 'bg-canvas text-sub'
                      : 'bg-brand-soft text-brand'
                }`}
                title={
                  copy.lastErrorCode
                    ? t('sync.failed', { code: copy.lastErrorCode })
                    : undefined
                }
              >
                {t(`sync.status.${copy.status}`)}
              </span>
              {copy.openConflictCount > 0 ? (
                <span className="rounded-full bg-draft-soft px-2.5 py-1 text-[12.5px] font-bold text-draft">
                  {t('sync.conflicts', { count: copy.openConflictCount })}
                </span>
              ) : null}
              {copy.status === 'FAILED' ? (
                <Button
                  onClick={() => void act('retry', copy.courseId)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {t('sync.retry')}
                </Button>
              ) : null}
              <Button
                onClick={() =>
                  void act(copy.paused ? 'resume' : 'pause', copy.courseId)
                }
                size="sm"
                type="button"
                variant="ghost"
              >
                {copy.paused ? t('sync.resume') : t('sync.pause')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      </details>
    </section>
  );
}
