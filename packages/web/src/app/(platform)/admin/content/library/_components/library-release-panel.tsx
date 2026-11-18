'use client';

import type {
  LibraryReleaseDraft,
} from '@cove/shared';
import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/studio/button';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';

/** Publish saved library edits as one batch. Academy review stays with academy staff. */
export function LibraryReleasePanel({
  courseId,
  initialDraft,
}: {
  courseId: string;
  initialDraft: LibraryReleaseDraft;
}) {
  const { t } = useTranslation('platform-library');
  const errorText = useErrorText();
  const [draft, setDraft] = React.useState<LibraryReleaseDraft | null>(
    initialDraft,
  );
  const queryClient = useQueryClient();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setDraft(await orpc.platformLibrarySync.draft({ courseId }));
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

    </section>
  );
}
