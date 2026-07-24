import { Plus } from 'lucide-react';

import { useLayoutTranslation } from '@/i18n';

import type { CourseBuilderState } from '../_hooks/use-course-builder';
import type { CourseModule } from '../_lib/course-tree';
import { DeleteButton, EditableTitle, MoveButtons } from './builder-controls';
import { LectureRow } from './lecture-row';

export function ModuleCard({
  builder,
  courseModule,
  exerciseBasePath,
  index,
}: {
  builder: CourseBuilderState;
  courseModule: CourseModule;
  exerciseBasePath: string;
  index: number;
}) {
  const { t } = useLayoutTranslation(['content', 'common']);
  const issueCount = builder.issuesByModule.get(courseModule.id) ?? 0;
  const addingLecture = builder.lectureModuleId === courseModule.id;
  const lectureIds = courseModule.lectures.map((lecture) => lecture.id);

  return (
    <article
      className={`overflow-hidden rounded-card border bg-white ${
        issueCount > 0 ? 'border-draft/50' : 'border-border'
      }`}
    >
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-brand-soft font-mono text-[13px] font-bold tabular-nums text-brand">
          {courseModule.position}
        </span>
        <div className="min-w-0 flex-1">
          <EditableTitle
            className="text-[15px] font-bold tracking-[-0.01em]"
            editable={builder.editable}
            onSave={(title) => builder.renameModule(courseModule.id, title)}
            value={courseModule.title}
          />
          <p className="text-[12px] text-sub">
            {t('module.lecture_count', {
              count: courseModule.lectures.length,
            })}
            {issueCount > 0 ? (
              <span className="ml-2 font-semibold text-draft">
                {t('module.issue_count', { count: issueCount })}
              </span>
            ) : null}
          </p>
        </div>
        {builder.editable ? (
          <div className="flex items-center gap-0.5">
            <MoveButtons
              canMoveDown={index < builder.tree.modules.length - 1}
              canMoveUp={index > 0}
              moveDownLabel={t('module.move_down')}
              moveUpLabel={t('module.move_up')}
              onMove={(direction) => builder.moveModule(index, direction)}
            />
            <DeleteButton
              ariaLabel={t('module.delete_aria', {
                title: courseModule.title,
              })}
              onDelete={() => builder.deleteModule(courseModule.id)}
            />
          </div>
        ) : null}
      </header>

      <ul className="divide-y divide-border">
        {courseModule.lectures.map((lecture, lectureIndex) => (
          <LectureRow
            builder={builder}
            exerciseBasePath={exerciseBasePath}
            index={lectureIndex}
            key={lecture.id}
            lecture={lecture}
            lectureIds={lectureIds}
            moduleId={courseModule.id}
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
              className="h-9 min-w-40 flex-1 rounded-lg border border-border bg-white px-3 text-[14px] outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
              maxLength={200}
              onChange={(event) => builder.setLectureTitle(event.target.value)}
              placeholder={t('lecture.title_placeholder')}
              value={builder.lectureTitle}
            />
            <button
              className="h-9 rounded-lg bg-brand px-4 text-[13px] font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-40"
              disabled={
                builder.createLecturePending || !builder.lectureTitle.trim()
              }
              type="submit"
            >
              {t('lecture.add')}
            </button>
            <button
              className="h-9 px-2 text-[13.5px] font-semibold text-sub transition-colors hover:text-ink"
              onClick={builder.cancelLecture}
              type="button"
            >
              {t('common:action.cancel')}
            </button>
          </form>
        ) : (
          <button
            className="flex w-full items-center gap-1.5 border-t border-border px-4 py-2.5 text-[13px] font-bold text-brand transition-colors hover:bg-brand-soft/50"
            onClick={() => builder.startLecture(courseModule.id)}
            type="button"
          >
            <Plus className="size-3.5" />
            {t('lecture.add')}
          </button>
        )
      ) : null}
    </article>
  );
}
