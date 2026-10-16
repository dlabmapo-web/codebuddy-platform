'use client';

import { libraryImportMaterialTypes, type PlatformCourse } from '@cove/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/studio/button';
import { Modal, ModalContent } from '@/components/studio/primitives';
import { useErrorText } from '@/i18n/client/use-error-text';
import { toApiError } from '@/lib/api-errors';
import { orpc } from '@/lib/orpc';
import { routes } from '@/lib/routes';

export function AcademyCourseImportDialog({
  source,
  onClose,
  onCopied,
}: {
  source: PlatformCourse;
  onClose: () => void;
  onCopied?: () => void;
}) {
  const { t } = useTranslation('platform-library');
  const errorText = useErrorText();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [title, setTitle] = React.useState(source.title);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);
  const [stale, setStale] = React.useState(false);
  const attempt = React.useRef<{
    signature: string;
    requestKey: string;
  } | null>(null);
  const submitting = React.useRef(false);
  const preview = useQuery({
    queryKey: ['library-import-preview', source.academyId, source.id],
    queryFn: () =>
      orpc.platformLibrary.previewAcademyCourse({
        sourceAcademyId: source.academyId,
        sourceCourseId: source.id,
      }),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const data = preview.data;
  const close = () => {
    if (!submitting.current) onClose();
  };
  const refresh = async () => {
    attempt.current = null;
    setError(null);
    const result = await preview.refetch();
    setStale(!result.isSuccess);
  };

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <ModalContent
        title={t('import.action')}
        description={t('import.description')}
      >
        <form
          className="flex min-h-0 flex-col"
          onSubmit={async (event) => {
            event.preventDefault();
            if (
              !data ||
              data.blockers.length ||
              stale ||
              preview.isFetching ||
              preview.isError ||
              submitting.current ||
              !title.trim()
            )
              return;
            const signature = JSON.stringify([
              source.academyId,
              source.id,
              data.sourceContentRevision,
              title.trim(),
            ]);
            if (attempt.current?.signature !== signature)
              attempt.current = { signature, requestKey: crypto.randomUUID() };
            submitting.current = true;
            setBusy(true);
            setError(null);
            try {
              const result = await orpc.platformLibrary.importAcademyCourse({
                sourceAcademyId: source.academyId,
                sourceCourseId: source.id,
                expectedSourceContentRevision: data.sourceContentRevision,
                title: title.trim(),
                requestKey: attempt.current.requestKey,
              });
              await Promise.all([
                queryClient.invalidateQueries({
                  queryKey: ['platform-library'],
                  refetchType: 'none',
                }),
                queryClient.invalidateQueries({
                  queryKey: ['platform-library-academy'],
                  refetchType: 'none',
                }),
              ]);
              router.push(
                `${routes.adminLibraryCourse(result.course.id)}?copied=1`,
              );
              (onCopied ?? onClose)();
            } catch (caught) {
              setError(caught);
              const code = toApiError(caught).code;
              if (
                code === 'LIBRARY_IMPORT_SOURCE_CHANGED' ||
                code === 'LIBRARY_IMPORT_CONTENT_INVALID'
              )
                setStale(true);
            } finally {
              submitting.current = false;
              setBusy(false);
            }
          }}
        >
          <div className="grid min-h-0 gap-4 overflow-y-auto px-6 py-5">
            <p className="text-sm text-sub">
              {source.academyName} · {source.title}
            </p>
            <label className="grid gap-1.5 text-sm font-bold text-ink">
              {t('import.title_label')}
              <input
                className="h-10 rounded-lg border border-border bg-card px-3 font-normal"
                value={title}
                maxLength={200}
                required
                disabled={busy}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            {preview.isFetching ? (
              <p role="status" className="text-sm text-sub">
                {t('import.loading')}
              </p>
            ) : null}
            {preview.error ? (
              <p role="alert" className="text-sm text-danger">
                {errorText(preview.error)}
              </p>
            ) : null}
            {data ? (
              <>
                <p className="text-sm text-sub">
                  {t('import.revision', {
                    revision: data.sourceContentRevision,
                  })}
                </p>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  {libraryImportMaterialTypes.map((type) => (
                    <div key={type} className="flex justify-between gap-2">
                      <dt>{t(`import.types.${type}`)}</dt>
                      <dd>{data.materialCounts[type]}</dd>
                    </div>
                  ))}
                </dl>
                {data.blockers.length ? (
                  <ul role="alert" className="grid gap-1 text-sm text-danger">
                    {data.blockers.map((blocker, index) => (
                      <li key={`${blocker.materialId}-${index}`}>
                        {blocker.materialTitle}:{' '}
                        {t(`import.blockers.${blocker.reason}`)}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <ul className="grid gap-3 text-sm">
                  {data.modules.map((module) => (
                    <li key={module.id}>
                      <span className="font-bold">{module.title}</span>{' '}
                      {!module.isVisible ? (
                        <span className="text-sub">{t('import.hidden')}</span>
                      ) : null}
                      <ul className="ml-4 mt-1 grid gap-2">
                        {module.lectures.map((lecture) => (
                          <li key={lecture.id}>
                            {lecture.title}{' '}
                            {!lecture.isVisible ? (
                              <span className="text-sub">
                                {t('import.hidden')}
                              </span>
                            ) : null}
                            <ul className="ml-4 text-sub">
                              {lecture.materials.map((material) => (
                                <li key={material.id}>
                                  {material.title} ·{' '}
                                  {t(`import.types.${material.type}`)}{' '}
                                  {!material.isVisible
                                    ? t('import.hidden')
                                    : ''}
                                </li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {stale || preview.isError || data?.blockers.length ? (
              <Button
                disabled={busy || preview.isFetching}
                onClick={() => void refresh()}
                type="button"
                variant="ghost"
              >
                {t('import.refresh')}
              </Button>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="shrink-0 px-6 py-3 text-sm text-danger">
              {errorText(error)}
            </p>
          ) : null}
          <div className="flex shrink-0 justify-end gap-2 border-t border-border px-6 py-4">
            <Button
              disabled={busy}
              onClick={close}
              type="button"
              variant="ghost"
            >
              {t('import.cancel')}
            </Button>
            <Button
              disabled={
                busy ||
                !data ||
                preview.isFetching ||
                preview.isError ||
                stale ||
                Boolean(data?.blockers.length) ||
                !title.trim()
              }
              type="submit"
            >
              {busy ? t('import.working') : t('import.confirm')}
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
}
