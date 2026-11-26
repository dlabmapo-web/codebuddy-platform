'use client';

import { CourseLanguageField } from '@/components/studio/course-language-field';
import { CoursePathPreview } from '@/components/studio/course-path-preview';
import { Modal, ModalContent } from '@/components/studio/primitives';
import { useLayoutTranslation } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';
import { useTranslation } from 'react-i18next';

import type { CoursesManagerState } from '../_hooks/use-courses-manager';

/**
 * Mirrors the old platform's 과목 dialog: a name, an optional description, and
 * a single confirm. Visibility stays in the course's Actions menu.
 */
export function CourseModal({ manager }: { manager: CoursesManagerState }) {
  const { t } = useLayoutTranslation(['courses', 'common']);
  const { t: grading } = useTranslation('grading');
  const errorText = useErrorText();
  const ready = manager.title.trim().length > 0;
  const editing = manager.editingId !== null;

  return (
    <Modal
      onOpenChange={(next) => {
        if (!next) manager.closeForm();
      }}
      open={manager.formOpen}
    >
      <ModalContent
        description={editing ? t('edit_modal.body') : t('create.body')}
        title={editing ? t('edit_modal.heading') : t('create.heading')}
      >
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (!ready || manager.submitPending) return;
            manager.submit();
          }}
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
            <label className="grid gap-1.5">
              <span className="text-[14px] font-bold">
                {t('create.title_label')}
                <span className="ml-1 text-danger">*</span>
              </span>
              <input
                autoFocus
                className="h-11 w-full rounded-lg border border-border bg-card px-3 text-[15px] outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
                maxLength={200}
                onChange={(event) => manager.setTitle(event.target.value)}
                placeholder={t('create.title_placeholder')}
                value={manager.title}
              />
            </label>

            <label className="grid gap-1.5">
              <span className="text-[14px] font-bold">
                {t('create.description_label')}{' '}
                <span className="font-normal text-sub">
                  {t('create.description_optional')}
                </span>
              </span>
              <textarea
                className="min-h-24 w-full resize-y rounded-lg border border-border bg-card px-3 py-2.5 text-[15px] leading-6 outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
                maxLength={10_000}
                onChange={(event) =>
                  manager.setDescription(event.target.value)
                }
                placeholder={t('create.description_placeholder')}
                value={manager.description}
              />
            </label>

            <CourseLanguageField
              copy={{
                label: grading('language.label'),
                locked: grading('language.locked'),
                options: {
                  PYTHON: { title: grading('language.options.PYTHON.title'), description: grading('language.options.PYTHON.description') },
                  C_CPP: { title: grading('language.options.C_CPP.title'), description: grading('language.options.C_CPP.description') },
                  WEB: { title: grading('language.options.WEB.title'), description: grading('language.options.WEB.description') },
                },
              }}
              locked={editing && manager.languageLocked}
              onChange={manager.setLanguage}
              value={manager.language}
            />

            {manager.aiTeacherAvailable ? (
              <fieldset className="grid gap-1.5">
                <legend className="mb-1.5 text-[14px] font-bold">{t('create.ai_label')}</legend>
                {([false, true] as const).map((included) => (
                  <label
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:border-brand/50 has-[:checked]:border-brand has-[:checked]:ring-2 has-[:checked]:ring-brand/20"
                    key={String(included)}
                  >
                    <input
                      checked={manager.aiTeacher === included}
                      className="mt-1 size-4 accent-brand"
                      name="ai-teacher"
                      onChange={() => manager.setAiTeacher(included)}
                      type="radio"
                    />
                    <span>
                      <span className="block text-[14px] font-semibold">
                        {t(included ? 'create.ai_on' : 'create.ai_off')}
                      </span>
                      <span className="mt-0.5 block text-[12.5px] leading-5 text-sub">
                        {t(included ? 'create.ai_on_hint' : 'create.ai_off_hint')}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
            ) : null}

            {editing ? null : (
              <CoursePathPreview
                labels={[
                  t('path.course'),
                  t('path.module'),
                  t('path.lecture'),
                  t(manager.language === 'WEB' ? 'path.material' : 'path.problem'),
                ]}
                title={t('create.next_step')}
              />
            )}

            {manager.submitError ? (
              <p className="rounded-lg bg-danger/5 px-3.5 py-2.5 text-[14px] font-semibold text-danger">
                {errorText(manager.submitError, t('create.title_conflict'))}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-canvas px-6 py-4">
            <button
              className="h-11 rounded-lg border border-border bg-card px-4 text-[14.5px] font-bold text-ink transition-colors hover:bg-canvas"
              onClick={manager.closeForm}
              type="button"
            >
              {t('common:action.cancel')}
            </button>
            <button
              className="h-11 rounded-lg bg-brand px-5 text-[14.5px] font-bold text-on-brand transition-colors hover:bg-brand-deep disabled:opacity-40"
              disabled={!ready || manager.submitPending}
              type="submit"
            >
              {manager.submitPending
                ? t('create.submitting')
                : editing
                  ? t('edit_modal.submit')
                  : t('create.submit')}
            </button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
}
