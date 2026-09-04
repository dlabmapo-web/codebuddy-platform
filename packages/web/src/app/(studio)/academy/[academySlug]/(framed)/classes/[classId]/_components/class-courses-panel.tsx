'use client';

import { useContentBasePath } from '@/components/studio/content-base-path-provider';

import { AlertTriangle, BookOpen, EyeOff, Plus, Unlink } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/studio/button';
import { useLayoutTranslation } from '@/i18n';

import type { ClassDetailManagerState } from '../_hooks/use-class-detail-manager';
import { ClassPanel, ClassPanelEmpty } from './class-panel';
import { ClassRowActions } from './class-row-actions';

export function ClassCoursesPanel({
  canAssign,
  manager,
}: {
  canAssign: boolean;
  manager: ClassDetailManagerState;
}) {
  const contentPaths = useContentBasePath();
  const { t } = useLayoutTranslation('classes');
  const { detail } = manager;
  const editable = canAssign && detail.status === 'ACTIVE';

  return (
    <ClassPanel
      action={
        editable ? (
          // Brand blue, matching "New class" on the list: assigning courses is
          // the page's primary action, not an incidental one. The header's
          // Edit and Archive stay outlined so the hierarchy reads at a glance.
          <Button onClick={manager.openAssign} size="sm">
            <Plus />
            {t('detail.courses_panel.assign')}
          </Button>
        ) : null
      }
      body={t('detail.courses_panel.body')}
      count={detail.courses.length}
      heading={t('detail.courses_panel.heading')}
    >
      {detail.courses.length === 0 ? (
        <ClassPanelEmpty>
          {editable
            ? t('detail.courses_panel.empty')
            : t('detail.courses_panel.empty_readonly')}
        </ClassPanelEmpty>
      ) : (
        <ul className="divide-y divide-border">
          {detail.courses.map((course) => (
            <li
              className="flex items-start gap-3 px-5 py-3.5"
              key={course.id}
            >
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                <BookOpen className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <Link
                  className="text-[14.5px] font-bold text-ink transition-colors hover:text-brand"
                  href={contentPaths.course(course.id)}
                >
                  {course.title}
                </Link>
                {/* A hidden course can be assigned, so the row has to say why
                    nothing happens for students until it is made visible. */}
                {course.isVisible ? null : (
                  <p className="mt-1 flex items-start gap-1.5 text-[13px] leading-5 text-draft">
                    <EyeOff className="mt-0.5 size-3.5 shrink-0" />
                    {t('detail.courses_panel.hidden_note')}
                  </p>
                )}
                {/* Worse than hidden, and quieter: a visible course with
                    nothing visible inside it is not shown to these students as
                    an empty course — it is not shown at all. */}
                {course.isVisible && course.visibleExercises === 0 ? (
                  <p className="mt-1 flex items-start gap-1.5 text-[13px] leading-5 text-warning">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    {t('detail.courses_panel.no_content_note')}
                  </p>
                ) : null}
              </div>
              {editable ? (
                // Unlink, not a trash can: the course itself survives, only
                // this class's claim on it ends.
                <ClassRowActions
                  disabled={manager.removalPending}
                  icon={Unlink}
                  menuAriaLabel={t('detail.courses_panel.row_menu_aria', {
                    title: course.title,
                  })}
                  onRemove={() => manager.askRemoveCourse(course)}
                  removeLabel={t('detail.courses_panel.remove')}
                  title={course.title}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </ClassPanel>
  );
}
