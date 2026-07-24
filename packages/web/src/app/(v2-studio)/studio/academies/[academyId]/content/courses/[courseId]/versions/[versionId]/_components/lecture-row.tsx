import { Plus } from 'lucide-react';
import Link from 'next/link';

import { useLayoutTranslation } from '@/i18n';

import type { CourseBuilderState } from '../_hooks/use-course-builder';
import type { CourseLecture } from '../_lib/course-tree';
import { DeleteButton, EditableTitle, MoveButtons } from './builder-controls';

export function LectureRow({
  builder,
  exerciseBasePath,
  index,
  lecture,
  lectureIds,
  moduleId,
}: {
  builder: CourseBuilderState;
  exerciseBasePath: string;
  index: number;
  lecture: CourseLecture;
  lectureIds: string[];
  moduleId: string;
}) {
  const { t } = useLayoutTranslation('content');
  const materialIds = lecture.materials.map((material) => material.id);

  return (
    <li className="px-4 py-2.5">
      <div className="flex items-center gap-3">
        <span className="w-6 shrink-0 font-mono text-[12px] tabular-nums text-sub">
          {lecture.position.toString().padStart(2, '0')}
        </span>
        <div className="min-w-0 flex-1">
          <EditableTitle
            className="text-[14px] font-semibold"
            editable={builder.editable}
            onSave={(title) => builder.renameLecture(lecture.id, title)}
            value={lecture.title}
          />
        </div>
        <span className="shrink-0 text-[12px] text-sub">
          {lecture.materials.length === 0
            ? t('lecture.no_exercises')
            : t('lecture.exercise_count', {
                count: lecture.materials.length,
              })}
        </span>
        {builder.editable ? (
          <div className="flex shrink-0 items-center gap-0.5">
            <MoveButtons
              canMoveDown={index < lectureIds.length - 1}
              canMoveUp={index > 0}
              moveDownLabel={t('lecture.move_down')}
              moveUpLabel={t('lecture.move_up')}
              onMove={(direction) =>
                builder.moveLecture(
                  moduleId,
                  lectureIds,
                  index,
                  direction,
                )
              }
            />
            <DeleteButton
              ariaLabel={t('lecture.delete_aria', { title: lecture.title })}
              onDelete={() => builder.deleteLecture(lecture.id)}
            />
          </div>
        ) : null}
      </div>
      {lecture.materials.length > 0 ? (
        <ol className="ml-9 mt-2 space-y-1.5 border-l border-border pl-3">
          {lecture.materials.map((material, materialIndex) => (
            <li className="flex items-center gap-2" key={material.id}>
              <span className="font-mono text-[11px] text-sub">
                {material.position.toString().padStart(2, '0')}
              </span>
              <Link
                className="min-w-0 flex-1 truncate text-[13px] font-semibold text-brand hover:text-brand-deep"
                href={`${exerciseBasePath}/${lecture.id}/exercises/${material.id}`}
              >
                {material.title}
              </Link>
              {builder.exerciseEditable ? (
                <div className="flex items-center">
                  <MoveButtons
                    canMoveDown={materialIndex < lecture.materials.length - 1}
                    canMoveUp={materialIndex > 0}
                    moveDownLabel={t('exercise.move_down')}
                    moveUpLabel={t('exercise.move_up')}
                    onMove={(direction) =>
                      builder.moveExercise(
                        lecture.id,
                        materialIds,
                        materialIndex,
                        direction,
                      )
                    }
                  />
                  <DeleteButton
                    ariaLabel={t('exercise.delete_aria', {
                      title: material.title,
                    })}
                    onDelete={() =>
                      builder.deleteExercise(lecture.id, material.id)
                    }
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      {builder.exerciseEditable ? (
        <Link
          className="ml-9 mt-2 inline-flex items-center gap-1 text-[12.5px] font-bold text-brand hover:text-brand-deep"
          href={`${exerciseBasePath}/${lecture.id}/exercises/new`}
        >
          <Plus className="size-3.5" />
          {t('exercise.add')}
        </Link>
      ) : null}
    </li>
  );
}
