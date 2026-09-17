import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronRight, Plus, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useContentSurface } from '@/components/studio/content-base-path-provider';
import { useTranslation } from 'react-i18next';
import { useLayoutTranslation } from '@/i18n';
import { VisibilityConfirmModal } from '../../../_components/visibility-confirm-modal';

import type { CourseBuilderState } from '../_hooks/use-course-builder';
import type { CourseLecture } from '../_lib/course-tree';
import { RowVisibility } from './builder-controls';
import { DragHandle, DropIndicator, useOutlineRowDnd } from './builder-dnd';
import { DeleteModal } from './delete-modal';
import { MoveAnywhereModal } from './move-anywhere-modal';
import { RenameModal } from './rename-modal';
import { RowMenu } from './row-menu';

type CourseMaterial = CourseLecture['materials'][number];

/**
 * Bring a row the author just moved into view and flash it once.
 *
 * The flash is a CSS animation removed when it ends, so the row keeps no
 * trace of it, and the reveal is consumed as soon as it is honoured so a later
 * re-render cannot scroll the page back to it.
 */
export function useRevealAfterMove<T extends HTMLElement>(
  builder: CourseBuilderState,
  id: string,
) {
  const ref = useRef<T>(null);
  const { revealId, clearReveal } = builder;
  useEffect(() => {
    if (revealId !== id) return;
    const node = ref.current;
    if (!node) return;
    // Scrolled to only when it is off screen: a row dropped in view is where
    // the author is already looking, and moving the page would lose them.
    const rect = node.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      node.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    }
    node.classList.remove('cove-move-flash');
    // Restart the animation even if the class was still present.
    void node.offsetWidth;
    node.classList.add('cove-move-flash');
    node.addEventListener(
      'animationend',
      () => node.classList.remove('cove-move-flash'),
      { once: true },
    );
    clearReveal();
  }, [clearReveal, id, revealId]);
  return ref;
}

/** Difficulty reads as a scale, so the tokens climb green → amber → red. */
const difficultyStyles = {
  EASY: 'bg-success/10 text-success',
  MEDIUM: 'bg-warning/10 text-warning',
  HARD: 'bg-danger/10 text-danger',
} as const;

/**
 * Outline numbers are the spine of this page: `2` is a module, `2-1` a lecture
 * inside it, `2-1-3` the third problem of that lecture. Order is real teaching
 * sequence here, so the numbering carries information rather than decoration.
 */
function OutlineNumber({
  children,
  tone = 'default',
}: {
  children: string;
  tone?: 'default' | 'strong';
}) {
  return (
    <span
      className={`shrink-0 font-mono text-[12.5px] tabular-nums ${
        tone === 'strong' ? 'font-bold text-ink' : 'text-sub'
      }`}
    >
      {children}
    </span>
  );
}

function ExerciseRow({
  builder,
  exercisePath,
  lectureId,
  material,
  outlineNumber,
  parentEffectivelyVisible,
  siblings,
}: {
  builder: CourseBuilderState;
  exercisePath: (lectureId: string, materialId: string) => string;
  lectureId: string;
  material: CourseMaterial;
  outlineNumber: string;
  parentEffectivelyVisible: boolean;
  siblings: readonly CourseMaterial[];
}) {
  const { t } = useTranslation(['content', 'courses']);
  // See `ModuleCard`: the flag is inert in a library academy.
  const visibilityIsReal = useContentSurface() !== 'library';
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [moving, setMoving] = useState(false);
  const rowRef = useRevealAfterMove<HTMLLIElement>(builder, material.id);
  const { dropEdge, handle, isDragging, setNodeRef } = useOutlineRowDnd({
    canDrag: builder.exerciseEditable && !builder.movePending,
    item: { kind: 'exercise', id: material.id, title: material.title },
    target: { row: { kind: 'exercise', id: material.id } },
  });
  const setRowNode = useCallback(
    (node: HTMLLIElement | null) => {
      rowRef.current = node;
      setNodeRef(node);
    },
    [rowRef, setNodeRef],
  );
  // Anywhere else in the course counts: a lecture's only problem can still
  // move to another lecture.
  const canMove =
    siblings.length > 1 ||
    builder.tree.modules.reduce((total, item) => total + item.lectures.length, 0) > 1;
  const href = exercisePath(lectureId, material.id);
  const exercise = material.programmingExercise;
  const effectivelyVisible = parentEffectivelyVisible && material.isVisible;

  return (
    <li
      className={`relative flex items-center gap-2.5 px-3 py-2 ${
        isDragging ? 'opacity-40' : ''
      }`}
      ref={setRowNode}
    >
      <DropIndicator edge={dropEdge} />
      <DragHandle className="-ml-1.5 -mr-1" handle={handle} />
      <OutlineNumber>{outlineNumber}</OutlineNumber>
      <Link
        className={`min-w-0 flex-1 truncate text-[14.5px] font-semibold text-brand hover:text-brand-deep hover:underline ${
          effectivelyVisible ? '' : 'opacity-55'
        }`}
        href={href}
      >
        {material.title}
      </Link>
      <div className="flex shrink-0 items-center gap-1">
        {visibilityIsReal ? (
          <RowVisibility
            busy={builder.visibilityPending(material.id)}
            editable={builder.exerciseEditable}
            effectivelyVisible={effectivelyVisible}
            isVisible={material.isVisible}
            onChange={(next) =>
              builder.setExerciseVisible(lectureId, material.id, next)
            }
            title={material.title}
          />
        ) : null}
        {exercise?.aiFeedbackEnabled ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11.5px] font-bold text-brand">
            <Sparkles className="size-2.5" />
            {t('exercise.badge.ai')}
          </span>
        ) : null}
        {exercise ? (
          <span
            className={`rounded-full px-2 py-0.5 text-[11.5px] font-bold ${
              difficultyStyles[exercise.difficulty]
            }`}
          >
            {t(`courses:exercise.difficulty.${exercise.difficulty}`)}
          </span>
        ) : null}
      </div>
      {builder.exerciseEditable ? (
        <RowMenu
          kindLabel={t('row.kind_exercise')}
          label={material.title}
          onDelete={() => setDeleting(true)}
          onMove={canMove ? () => setMoving(true) : undefined}
          // A problem's title lives with the rest of its content, so renaming
          // opens the problem instead of editing the row in place.
          onRename={() => router.push(href)}
        />
      ) : null}
      {moving ? (
        <MoveAnywhereModal
          builder={builder}
          itemId={material.id}
          kind="exercise"
          onClose={() => setMoving(false)}
          visibilityIsReal={visibilityIsReal}
        />
      ) : null}
      <DeleteModal
        itemTitle={material.title}
        kind="exercise"
        onCancel={() => setDeleting(false)}
        onConfirm={() => {
          setDeleting(false);
          builder.deleteExercise(lectureId, material.id);
        }}
        open={deleting}
      />
    </li>
  );
}

export function LectureRow({
  builder,
  exercisePath,
  lecture,
  moduleId,
  moduleNumber,
  parentEffectivelyVisible,
}: {
  builder: CourseBuilderState;
  exercisePath: (lectureId: string, materialId: string) => string;
  lecture: CourseLecture;
  moduleId: string;
  moduleNumber: number;
  parentEffectivelyVisible: boolean;
}) {
  const { t } = useTranslation(['content', 'courses']);
  const visibilityIsReal = useContentSurface() !== 'library';
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [hiding, setHiding] = useState(false);
  const [moving, setMoving] = useState(false);
  const rowRef = useRevealAfterMove<HTMLLIElement>(builder, lecture.id);
  // The header is the lecture's handle and target. It takes a dragged lecture
  // beside it, and a dragged problem into its list — the only way to reach a
  // lecture that is collapsed or has no problems yet.
  const {
    dropEdge,
    handle,
    isDragging,
    setNodeRef,
  } = useOutlineRowDnd({
    canDrag: builder.editable && !builder.movePending,
    canDrop: (builder.editable || builder.exerciseEditable) && !builder.movePending,
    item: { kind: 'lecture', id: lecture.id, title: lecture.title },
    target: {
      row: builder.editable ? { kind: 'lecture', id: lecture.id } : undefined,
      container: builder.exerciseEditable
        ? { accepts: 'exercise', parentId: lecture.id }
        : undefined,
    },
  });
  const siblings =
    builder.tree.modules.find((item) => item.id === moduleId)?.lectures ?? [];
  const canMove = siblings.length > 1 || builder.tree.modules.length > 1;
  const effectivelyVisible = parentEffectivelyVisible && lecture.isVisible;
  const lectureNumber = `${moduleNumber}-${lecture.position}`;
  const open = !builder.isCollapsed(lecture.id);
  const hasExercises = lecture.materials.length > 0;

  return (
    <Collapsible.Root
      asChild
      onOpenChange={() => builder.toggleCollapsed(lecture.id)}
      open={open}
    >
      <li
        className={`px-4 py-3 ${isDragging ? 'opacity-40' : ''}`}
        ref={rowRef}
      >
        <div
          className="relative -mx-2 flex items-center gap-2.5 rounded-lg px-2 py-0.5"
          ref={setNodeRef}
        >
          <DropIndicator edge={dropEdge} />
          <DragHandle className="-ml-1.5 -mr-1.5" handle={handle} />
          <Collapsible.Trigger asChild>
            <button
              aria-label={t('outline.toggle', { title: lecture.title })}
              className={`grid size-6 shrink-0 place-items-center rounded text-sub transition-colors hover:bg-canvas hover:text-ink ${
                hasExercises ? '' : 'invisible'
              }`}
              disabled={!hasExercises}
              type="button"
            >
              <ChevronRight
                className={`size-3.5 transition-transform duration-200 ${
                  open ? 'rotate-90' : ''
                }`}
              />
            </button>
          </Collapsible.Trigger>
          <OutlineNumber tone="strong">{lectureNumber}</OutlineNumber>
          <div
            className={`flex min-w-0 flex-1 items-center gap-2 ${
              effectivelyVisible ? '' : 'opacity-55'
            }`}
          >
            <p className="truncate text-[15.5px] font-semibold">
              {lecture.title}
            </p>
            {/* The count sits with the title it describes, not off at the edge. */}
            <span className="shrink-0 text-[13px] text-sub">
              {hasExercises
                ? t('lecture.exercise_count', {
                    count: lecture.materials.length,
                  })
                : t('lecture.no_exercises')}
            </span>
          </div>
          {visibilityIsReal ? (
            <RowVisibility
              busy={builder.visibilityPending(lecture.id)}
              editable={builder.editable}
              effectivelyVisible={effectivelyVisible}
              isVisible={lecture.isVisible}
              onChange={(next) => {
                if (!next) {
                  setHiding(true);
                  return;
                }
                builder.setLectureVisible(lecture.id, true);
              }}
              title={lecture.title}
            />
          ) : null}
          {builder.editable ? (
            <RowMenu
              kindLabel={t('row.kind_lecture')}
              label={lecture.title}
              onDelete={() => setDeleting(true)}
              onMove={canMove ? () => setMoving(true) : undefined}
              onRename={() => setRenaming(true)}
            />
          ) : null}
        </div>

        <Collapsible.Content className="cove-collapse">
          {/* Problems live in their own bordered well, indented and inset from
              the right, so their menus never line up with the lecture's. */}
          {hasExercises ? (
            <ol className="ml-8 mr-9 mt-2.5 divide-y divide-border overflow-hidden rounded-lg border border-border bg-canvas/50">
              {lecture.materials.map((material) => (
                <ExerciseRow
                  builder={builder}
                  exercisePath={exercisePath}
                  key={material.id}
                  lectureId={lecture.id}
                  material={material}
                  outlineNumber={`${lectureNumber}-${material.position}`}
                  parentEffectivelyVisible={effectivelyVisible}
                  siblings={lecture.materials}
                />
              ))}
            </ol>
          ) : null}

          {builder.exerciseEditable ? (
            <Link
              className="ml-8 mt-2 inline-flex items-center gap-1 text-[13.5px] font-bold text-brand hover:text-brand-deep"
              href={exercisePath(lecture.id, 'new')}
            >
              <Plus className="size-3.5" />
              {t('exercise.add')}
            </Link>
          ) : null}
        </Collapsible.Content>

        {renaming ? (
          <RenameModal
            kind="lecture"
            onCancel={() => setRenaming(false)}
            onSave={(title) => {
              setRenaming(false);
              builder.renameLecture(lecture.id, title);
            }}
            open
            value={lecture.title}
          />
        ) : null}
        {moving ? (
          <MoveAnywhereModal
            builder={builder}
            itemId={lecture.id}
            kind="lecture"
            onClose={() => setMoving(false)}
            visibilityIsReal={visibilityIsReal}
          />
        ) : null}
        <DeleteModal
          cascade={{ exercises: lecture.materials.length }}
          itemTitle={lecture.title}
          kind="lecture"
          onCancel={() => setDeleting(false)}
          onConfirm={() => {
            setDeleting(false);
            builder.deleteLecture(lecture.id);
          }}
          open={deleting}
        />
        <VisibilityConfirmModal
          affected={[
            {
              label: t('visibility_confirm.problems'),
              value: lecture.materials.length,
            },
          ]}
          itemTitle={lecture.title}
          kindLabel={t('row.kind_lecture')}
          onCancel={() => setHiding(false)}
          onConfirm={() => {
            setHiding(false);
            builder.setLectureVisible(lecture.id, false);
          }}
          open={hiding}
        />
      </li>
    </Collapsible.Root>
  );
}
