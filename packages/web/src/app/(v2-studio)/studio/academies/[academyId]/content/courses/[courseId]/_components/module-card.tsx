import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronRight, Plus } from 'lucide-react';
import { useState } from 'react';

import { useLayoutTranslation } from '@/i18n';
import { VisibilityConfirmModal } from '../../../_components/visibility-confirm-modal';

import type { CourseBuilderState } from '../_hooks/use-course-builder';
import type { CourseModule } from '../_lib/course-tree';
import { VisibilityIndicator } from './builder-controls';
import { DeleteModal } from './delete-modal';
import { LectureRow } from './lecture-row';
import { RenameModal } from './rename-modal';
import { RowMenu } from './row-menu';

export function ModuleCard({
  builder,
  courseModule,
  exerciseBasePath,
}: {
  builder: CourseBuilderState;
  courseModule: CourseModule;
  exerciseBasePath: string;
}) {
  const { t } = useLayoutTranslation(['content', 'common']);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [hiding, setHiding] = useState(false);
  const addingLecture = builder.lectureModuleId === courseModule.id;
  const effectivelyVisible =
    builder.tree.course.isVisible && courseModule.isVisible;
  const exerciseCount = courseModule.lectures.reduce(
    (total, lecture) => total + lecture.materials.length,
    0,
  );

  const open = !builder.isCollapsed(courseModule.id);

  return (
    <Collapsible.Root
      asChild
      onOpenChange={() => builder.toggleCollapsed(courseModule.id)}
      open={open}
    >
    <article className="overflow-hidden rounded-card border border-border bg-white">
      {/* The module header is tinted so it reads as the group it owns, never as
          a sibling of the lecture rows beneath it. */}
      <header className="flex items-center gap-2.5 border-b border-border bg-canvas px-4 py-3.5">
        <Collapsible.Trigger asChild>
          <button
            aria-label={t('outline.toggle', { title: courseModule.title })}
            className="grid size-7 shrink-0 place-items-center rounded-md text-sub transition-colors hover:bg-white hover:text-ink"
            type="button"
          >
            <ChevronRight
              className={`size-4 transition-transform duration-200 ${
                open ? 'rotate-90' : ''
              }`}
            />
          </button>
        </Collapsible.Trigger>
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-brand font-mono text-[14px] font-bold tabular-nums text-white">
          {courseModule.position}
        </span>
        <div
          className={`min-w-0 flex-1 ${effectivelyVisible ? '' : 'opacity-55'}`}
        >
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-[16.5px] font-bold tracking-[-0.01em]">
              {courseModule.title}
            </p>
          </div>
          <p className="text-[13px] text-sub">
            {t('module.lecture_count', {
              count: courseModule.lectures.length,
            })}
            {exerciseCount > 0 ? (
              <span className="text-sub/70">
                {' · '}
                {t('lecture.exercise_count', { count: exerciseCount })}
              </span>
            ) : null}
          </p>
        </div>
        <VisibilityIndicator
          effectivelyVisible={effectivelyVisible}
          isVisible={courseModule.isVisible}
        />
        {builder.editable ? (
          <RowMenu
            isVisible={courseModule.isVisible}
            kindLabel={t('row.kind_module')}
            label={courseModule.title}
            onDelete={() => setDeleting(true)}
            onRename={() => setRenaming(true)}
            onToggleVisible={(next) => {
              if (!next) {
                setHiding(true);
                return;
              }
              builder.setModuleVisible(courseModule.id, next);
            }}
            tone="strong"
          />
        ) : null}
      </header>

      <Collapsible.Content className="cove-collapse">
      <ul className="divide-y divide-border">
        {courseModule.lectures.map((lecture) => (
          <LectureRow
            builder={builder}
            exerciseBasePath={exerciseBasePath}
            key={lecture.id}
            lecture={lecture}
            moduleNumber={courseModule.position}
            parentEffectivelyVisible={effectivelyVisible}
          />
        ))}
      </ul>

      {builder.editable ? (
        addingLecture ? (
          <form
            className="flex flex-wrap gap-2 border-t border-border bg-canvas p-3"
            onSubmit={(event) => {
              event.preventDefault();
              builder.createLecture();
            }}
          >
            <input
              autoFocus
              className="h-11 min-w-40 flex-1 rounded-lg border border-border bg-white px-3 text-[15px] outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
              maxLength={200}
              onChange={(event) => builder.setLectureTitle(event.target.value)}
              placeholder={t('lecture.title_placeholder')}
              value={builder.lectureTitle}
            />
            <button
              className="h-11 rounded-lg bg-brand px-4 text-[14px] font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-40"
              disabled={
                builder.createLecturePending || !builder.lectureTitle.trim()
              }
              type="submit"
            >
              {t('lecture.add')}
            </button>
            <button
              className="h-11 px-2 text-[14.5px] font-semibold text-sub transition-colors hover:text-ink"
              onClick={builder.cancelLecture}
              type="button"
            >
              {t('common:action.cancel')}
            </button>
          </form>
        ) : (
          <button
            className="flex w-full items-center gap-1.5 border-t border-border px-4 py-3 text-[14px] font-bold text-brand transition-colors hover:bg-brand-soft/50"
            onClick={() => builder.startLecture(courseModule.id)}
            type="button"
          >
            <Plus className="size-3.5" />
            {t('lecture.add')}
          </button>
        )
      ) : null}
      </Collapsible.Content>

      {renaming ? (
        <RenameModal
          kind="module"
          onCancel={() => setRenaming(false)}
          onSave={(title) => {
            setRenaming(false);
            builder.renameModule(courseModule.id, title);
          }}
          open
          value={courseModule.title}
        />
      ) : null}
      <DeleteModal
        cascade={{
          exercises: exerciseCount,
          lectures: courseModule.lectures.length,
        }}
        itemTitle={courseModule.title}
        kind="module"
        onCancel={() => setDeleting(false)}
        onConfirm={() => {
          setDeleting(false);
          builder.deleteModule(courseModule.id);
        }}
        open={deleting}
      />
      <VisibilityConfirmModal
        affected={[
          {
            label: t('visibility_confirm.lectures'),
            value: courseModule.lectures.length,
          },
          {
            label: t('visibility_confirm.problems'),
            value: exerciseCount,
          },
        ]}
        itemTitle={courseModule.title}
        kindLabel={t('row.kind_module')}
        onCancel={() => setHiding(false)}
        onConfirm={() => {
          setHiding(false);
          builder.setModuleVisible(courseModule.id, false);
        }}
        open={hiding}
      />
    </article>
    </Collapsible.Root>
  );
}
