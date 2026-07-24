import { Button } from '@/components/studio/button';
import { Input } from '@/components/studio/primitives';
import { useLayoutTranslation } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';

import type { CoursesManagerState } from '../_hooks/use-courses-manager';

export function CreateCourseForm({
  manager,
}: {
  manager: CoursesManagerState;
}) {
  const { t } = useLayoutTranslation('courses');
  const errorText = useErrorText();

  return (
    <form
      className="rounded-card border border-brand/25 bg-brand-soft/40 p-5"
      onSubmit={(event) => {
        event.preventDefault();
        manager.create();
      }}
    >
      <h2 className="text-[15px] font-bold">{t('create.heading')}</h2>
      <p className="mt-1 text-[13.5px] leading-[1.55] text-sub">
        {t('create.body')}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1.4fr_auto]">
        <label className="grid gap-1.5">
          <span className="text-[13px] font-semibold">
            {t('create.title_label')}
          </span>
          <Input
            maxLength={200}
            onChange={(event) => manager.setTitle(event.target.value)}
            placeholder={t('create.title_placeholder')}
            required
            value={manager.title}
          />
        </label>
        <label className="grid gap-1.5">
          <span className="text-[13px] font-semibold">
            {t('create.description_label')}{' '}
            <span className="font-normal text-sub">
              {t('create.description_optional')}
            </span>
          </span>
          <Input
            maxLength={10000}
            onChange={(event) => manager.setDescription(event.target.value)}
            placeholder={t('create.description_placeholder')}
            value={manager.description}
          />
        </label>
        <Button
          className="self-end"
          disabled={
            manager.createPending || manager.title.trim().length === 0
          }
          type="submit"
          variant="ink"
        >
          {manager.createPending
            ? t('create.submitting')
            : t('create.submit')}
        </Button>
      </div>
      {manager.createError ? (
        <p className="mt-3 text-[13px] font-semibold text-danger">
          {errorText(manager.createError, t('create.title_conflict'))}
        </p>
      ) : null}
    </form>
  );
}
