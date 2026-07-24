import { Check, TriangleAlert } from 'lucide-react';

import { useLayoutTranslation } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';

import { VersionChip } from '../../../../../_components/version-marks';
import type { CourseBuilderState } from '../_hooks/use-course-builder';
import { Stat } from './builder-controls';

export function BuilderSidebar({
  builder,
  canPublish,
}: {
  builder: CourseBuilderState;
  canPublish: boolean;
}) {
  const { t } = useLayoutTranslation('content');
  const errorText = useErrorText();
  const { tree, issues } = builder;

  return (
    <aside className="space-y-4 lg:sticky lg:top-6">
      <div className="rounded-card border border-border bg-white p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[13px] font-bold uppercase tracking-wider text-sub">
            {t('sidebar.heading')}
          </h2>
          <VersionChip
            state={
              tree.version.status === 'DRAFT'
                ? 'draft'
                : tree.version.status === 'PUBLISHED'
                  ? 'published'
                  : 'retired'
            }
            versionNumber={tree.version.versionNumber}
          />
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3">
          <Stat label={t('sidebar.modules')} value={tree.modules.length} />
          <Stat label={t('sidebar.lectures')} value={builder.lectureCount} />
        </dl>

        {tree.version.status === 'DRAFT' ? (
          <div className="mt-5 space-y-2 border-t border-border pt-4">
            <button
              className="h-10 w-full rounded-lg border border-border bg-white text-[14px] font-bold text-ink transition-colors hover:border-brand hover:text-brand disabled:opacity-40"
              disabled={builder.validatePending}
              onClick={builder.validate}
              type="button"
            >
              {builder.validatePending
                ? t('sidebar.checking')
                : t('sidebar.check')}
            </button>
            {canPublish ? (
              <button
                className="h-10 w-full rounded-lg bg-brand text-[14px] font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-40"
                disabled={
                  builder.publishPending ||
                  issues === null ||
                  issues.length > 0
                }
                onClick={builder.publish}
                type="button"
              >
                {builder.publishPending
                  ? t('sidebar.publishing')
                  : t('sidebar.publish', {
                      version: tree.version.versionNumber,
                    })}
              </button>
            ) : null}
            <p className="text-[12.5px] leading-[1.55] text-sub">
              {issues === null
                ? t('sidebar.hint_unchecked')
                : issues.length === 0
                  ? t('sidebar.hint_ready')
                  : t('sidebar.hint_blocked')}
            </p>
            {builder.publishError ? (
              <p className="text-[12px] font-semibold text-danger">
                {errorText(
                  builder.publishError,
                  t('sidebar.publish_refused'),
                )}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {issues !== null ? (
        <div
          className={`rounded-card border p-5 ${
            issues.length === 0
              ? 'border-success/30 bg-success/5'
              : 'border-draft/30 bg-draft-soft'
          }`}
        >
          {issues.length === 0 ? (
            <p className="flex items-center gap-2 text-[14px] font-bold text-success">
              <Check className="size-4" />
              {t('issues.ready')}
            </p>
          ) : (
            <>
              <p className="flex items-center gap-2 text-[14px] font-bold text-draft">
                <TriangleAlert className="size-4" />
                {t('issues.count', { count: issues.length })}
              </p>
              <ul className="mt-3 space-y-2.5">
                {issues.map((issue) => (
                  <li
                    className="text-[13.5px] leading-[1.55] text-draft"
                    key={`${issue.path}-${issue.code}`}
                  >
                    {issue.message}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : null}

      <p className="px-1 text-[12.5px] leading-[1.55] text-sub">
        {t('sidebar.roadmap')}
      </p>
    </aside>
  );
}
