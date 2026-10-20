import {VideoAuthorDialog} from "@/components/video/video-author-dialog";
import { publicConfig } from '@/lib/config';
import { ManualAuthorDialog } from '@/components/manual/manual-author-dialog';
import { PdfAuthorDialog } from '@/components/pdf/pdf-author-dialog';
import * as Collapsible from '@radix-ui/react-collapsible';
import { BookOpen, Braces, ChevronRight, FileCode2, FileText, ListChecks, PenLine, Sparkles, Turtle, Video } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { routes } from '@/lib/routes';
import { useContentAcademySlug, useContentSurface } from '@/components/studio/content-base-path-provider';
import { useTranslation } from 'react-i18next';
import { VisibilityConfirmModal } from '../../../_components/visibility-confirm-modal';

import type { CourseBuilderState } from '../_hooks/use-course-builder';
import type { CourseLecture } from '../_lib/course-tree';
import { RowVisibility } from './builder-controls';
import { DragHandle, DropIndicator, useOutlineRowDnd } from './builder-dnd';
import { DeleteModal } from './delete-modal';
import { MoveAnywhereModal } from './move-anywhere-modal';
import { RenameModal } from './rename-modal';
import { RowMenu } from './row-menu';
import { NewMaterialDialog } from './new-material-dialog';
import { availableMaterialKinds, type MaterialCreationKind } from '../_lib/material-creation';

function formatMaterialSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
      const reduce = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      ).matches;
      node.scrollIntoView({
        block: 'center',
        behavior: reduce ? 'auto' : 'smooth',
      });
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
  const { t } = useTranslation(['content', 'courses', 'pdf-practice', 'material-picker']);
  // See `ModuleCard`: the flag is inert in a library academy.
  const surface = useContentSurface();
  const academySlug = useContentAcademySlug();
  const visibilityIsReal = surface !== 'library';
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [pdfMode, setPdfMode] = useState<'preview' | 'edit' | null>(null);
  const [manualOpen,setManualOpen]=useState(false);
  const [videoOpen,setVideoOpen]=useState(false);
  const isManual=material.type==='TURTLE_EXERCISE'||material.type==='WRITTEN_RESPONSE'||material.type==='MULTIPLE_CHOICE';
  const rowEditable =
    material.type !== 'PROGRAMMING_EXERCISE'
      ? builder.editable
      : builder.exerciseEditable;
  const [moving, setMoving] = useState(false);
  const rowRef = useRevealAfterMove<HTMLLIElement>(builder, material.id);
  const { dropEdge, handle, isDragging, setNodeRef } = useOutlineRowDnd({
    canDrag: rowEditable && !builder.movePending,
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
    builder.tree.modules.reduce(
      (total, item) => total + item.lectures.length,
      0,
    ) > 1;
  const href = exercisePath(lectureId, material.id);
  const viewHref = surface !== 'academy' ? href
    : material.type === 'VIDEO_LESSON'
      ? routes.academyLearnVideo(academySlug, material.id, { preview: true })
      : isManual
        ? routes.academyLearnAssessment(academySlug, material.id, material.type, { preview: true })
        : routes.academyLearnExercise(academySlug, material.id);
  const exercise = material.programmingExercise;
  const effectivelyVisible = parentEffectivelyVisible && material.isVisible;
  const materialKind: MaterialCreationKind = material.type === 'PDF_DOCUMENT'
    ? 'pdf' : material.type === 'VIDEO_LESSON'
      ? 'video' : material.type === 'TURTLE_EXERCISE'
        ? 'turtle' : material.type === 'MULTIPLE_CHOICE'
          ? 'multipleChoice' : material.type === 'WRITTEN_RESPONSE'
            ? 'written' : exercise?.referencePdfMaterialId ? 'pdfPractice' : 'python';
  const MaterialIcon = {
    pdf: FileText, video: Video, turtle: Turtle, multipleChoice: ListChecks,
    written: PenLine, shortAnswer: PenLine, pdfPractice: FileCode2, python: Braces,
  }[materialKind];
  const titleClass = `block max-w-full truncate rounded text-left text-[14px] font-semibold text-ink hover:text-brand focus-visible:outline-2 focus-visible:outline-brand ${effectivelyVisible ? '' : 'opacity-55'}`;

  return (
    <li
      className={`relative flex items-center gap-2.5 px-3 py-3.5 transition-colors hover:bg-canvas/60 ${
        isDragging ? 'opacity-40' : ''
      }`}
      ref={setRowNode}
    >
      <DropIndicator edge={dropEdge} />
      <DragHandle className="-ml-1.5 -mr-1" handle={handle} />
      <OutlineNumber>{outlineNumber}</OutlineNumber>
      <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${material.type === 'PDF_DOCUMENT' ? 'bg-warning/10 text-warning' : material.type === 'VIDEO_LESSON' ? 'bg-success/10 text-success' : 'bg-brand-soft text-brand'}`}>
        <MaterialIcon aria-hidden className="size-4.5" strokeWidth={1.7} />
      </span>
      <div className="min-w-0 flex-1">
        {surface === 'academy' && material.type !== 'PDF_DOCUMENT' ? (
          <Link className={titleClass} href={viewHref}>{material.title}</Link>
        ) : material.type==='VIDEO_LESSON' ? <button type="button" className={titleClass} onClick={()=>setVideoOpen(true)}>{material.title}</button> : isManual ? <button type="button" className={titleClass} onClick={()=>setManualOpen(true)}>{material.title}</button> : material.type === 'PDF_DOCUMENT' ? (
          <button
            type="button"
            className={`${titleClass} text-brand hover:underline`}
            onClick={() => setPdfMode('preview')}
          >
            {material.title}
          </button>
        ) : (
          <Link className={titleClass} href={href}>
            {material.title}
          </Link>
        )}
        {material.pdfDocument ? (
          <span className="block truncate text-xs text-sub">
            {t('pdf.badge')} · {t(`pdf.placements.${material.pdfDocument.placement}`)} ·{' '}
            {material.pdfDocument.originalFilename} ·{' '}
            {formatMaterialSize(material.pdfDocument.byteSize)}
          </span>
        ) : <span className="mt-0.5 block text-xs text-sub">{t(`material-picker:types.${materialKind}.title`)}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {material.type === 'PDF_DOCUMENT' ? <button type="button" aria-label={`${t('pdf.open')}: ${material.title}`} title={t('pdf.open')} onClick={() => setPdfMode('preview')} className="grid size-7 place-items-center rounded-md text-brand transition-colors hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-brand"><BookOpen aria-hidden className="size-4" /></button> : null}
        {visibilityIsReal ? (
          <RowVisibility
            busy={builder.visibilityPending(material.id)}
            editable={rowEditable}
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
      {rowEditable ? (
        <RowMenu
          kindLabel={
            material.pdfDocument ? t('pdf.badge') : t('row.kind_exercise')
          }
          renameLabel={material.pdfDocument ? t('pdf.edit_action') : t('row.edit')}
          extraItems={
            material.pdfDocument
              ? [
                  {
                    label: t('pdf.preview'),
                    onSelect: () => {
                      setPdfMode('preview');
                    },
                  },
                  {
                    label: t('pdf.replace_action'),
                    onSelect: () => {
                      setPdfMode('edit');
                    },
                  },
                ]
              : undefined
          }
          label={material.title}
          onDelete={() => setDeleting(true)}
          onMove={canMove ? () => setMoving(true) : undefined}
          // A problem's title lives with the rest of its content, so renaming
          // opens the problem instead of editing the row in place.
          onRename={() =>
            isManual ? setManualOpen(true) : material.type === 'VIDEO_LESSON' ? setVideoOpen(true) : material.type === 'PDF_DOCUMENT'
              ? setPdfMode('edit')
              : router.push(href)
          }
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
        dependencyTitles={material.type === "PDF_DOCUMENT" ? siblings.filter(row => row.programmingExercise?.referencePdfMaterialId === material.id).map(row => row.title) : []}
        itemTitle={material.title}
        kind={material.type === 'PDF_DOCUMENT' ? 'pdf' : 'exercise'}
        onCancel={() => setDeleting(false)}
        onConfirm={() => {
          setDeleting(false);
          builder.deleteExercise(lectureId, material.id);
        }}
        open={deleting}
      />
      {manualOpen ? <ManualAuthorDialog target={{...builder.target,lectureId}} material={material} onClose={()=>setManualOpen(false)} onSaved={builder.refresh}/> : null}
      {videoOpen?<VideoAuthorDialog target={{...builder.target,lectureId}} material={material} editable={rowEditable} onClose={()=>setVideoOpen(false)} onSaved={builder.refresh}/>:null}
      {pdfMode ? (
        <PdfAuthorDialog
          target={{ ...builder.target, lectureId }}
          material={material}
          referringExercises={siblings.filter(row => row.programmingExercise?.referencePdfMaterialId === material.id)}
          initialPreview={pdfMode === 'preview'}
          editable={builder.editable}
          onClose={() => {
            setPdfMode(null);
          }}
          onSaved={builder.refresh}
        />
      ) : null}
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
  const { t } = useTranslation(['content', 'courses', 'pdf-practice']);
  const visibilityIsReal = useContentSurface() !== 'library';
  const [pdfAdding, setPdfAdding] = useState(false);
  const router = useRouter();
  const materialKinds = availableMaterialKinds({ ...publicConfig, editable: builder.editable, exerciseEditable: builder.exerciseEditable });
  function chooseMaterial(kind: MaterialCreationKind) {
    switch (kind) {
      case 'python': router.push(exercisePath(lecture.id, 'new')); break;
      case 'pdfPractice': router.push(`${exercisePath(lecture.id, 'new')}?referencePdf=required`); break;
      case 'pdf': setPdfAdding(true); break;
      case 'written': setWrittenAdding(true); break;
      case 'turtle': setManualAdding(true); break;
      case 'multipleChoice': setChoiceAdding(true); break;
      case 'shortAnswer': setShortAdding(true); break;
      case 'video': setVideoAdding(true); break;
    }
  }
  const [manualAdding,setManualAdding]=useState(false);
  const [choiceAdding,setChoiceAdding] = useState(false);
  const [videoAdding,setVideoAdding]=useState(false);
  const [shortAdding,setShortAdding]=useState(false);
  const [writtenAdding,setWrittenAdding]=useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [hiding, setHiding] = useState(false);
  const [moving, setMoving] = useState(false);
  const rowRef = useRevealAfterMove<HTMLLIElement>(builder, lecture.id);
  // The header is the lecture's handle and target. It takes a dragged lecture
  // beside it, and a dragged problem into its list — the only way to reach a
  // lecture that is collapsed or has no problems yet.
  const { dropEdge, handle, isDragging, setNodeRef } = useOutlineRowDnd({
    canDrag: builder.editable && !builder.movePending,
    canDrop:
      (builder.editable || builder.exerciseEditable) && !builder.movePending,
    item: { kind: 'lecture', id: lecture.id, title: lecture.title },
    target: {
      row: builder.editable ? { kind: 'lecture', id: lecture.id } : undefined,
      container:
        builder.exerciseEditable || builder.editable
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
  const exerciseCount = lecture.materials.filter(
    (m) => m.type !== 'PDF_DOCUMENT',
  ).length;
  const documentCount = lecture.materials.length - exerciseCount;

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
          className="relative -mx-2 flex flex-wrap items-center gap-2.5 rounded-lg px-2 py-1.5"
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
            className={`flex min-w-32 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 ${
              effectivelyVisible ? '' : 'opacity-55'
            }`}
          >
            <p className="truncate text-[15.5px] font-semibold">
              {lecture.title}
            </p>
            {/* The count sits with the title it describes, not off at the edge. */}
            <span className="shrink-0 text-[13px] text-sub">
              {hasExercises
                ? exerciseCount
                  ? t('lecture.exercise_count', {
                      count: exerciseCount,
                    })
                  : ''
                : t('lecture.no_exercises')}
              {documentCount
                ? ` · ${t('pdf.document_count', { count: documentCount })}`
                : ''}
            </span>
          </div>
          <NewMaterialDialog kinds={materialKinds} lectureTitle={lecture.title} onChoose={chooseMaterial} />
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
          {/* Keep the reading order and drag targets in one material list. */}
          {hasExercises ? (
            <ol className="ml-0 mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card sm:ml-8">
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
        </Collapsible.Content>

        {videoAdding?<VideoAuthorDialog target={{...builder.target,lectureId:lecture.id}} onClose={()=>setVideoAdding(false)} onSaved={builder.refresh}/>:null}
        {choiceAdding ? <ManualAuthorDialog type="MULTIPLE_CHOICE" target={{...builder.target,lectureId:lecture.id}} onClose={()=>setChoiceAdding(false)} onSaved={builder.refresh}/> : null}
        {shortAdding ? <ManualAuthorDialog shortAnswer type="WRITTEN_RESPONSE" target={{...builder.target,lectureId:lecture.id}} onClose={()=>setShortAdding(false)} onSaved={builder.refresh}/> : null}
        {writtenAdding ? <ManualAuthorDialog type="WRITTEN_RESPONSE" target={{...builder.target,lectureId:lecture.id}} onClose={()=>setWrittenAdding(false)} onSaved={builder.refresh}/> : null}
        {manualAdding ? <ManualAuthorDialog target={{...builder.target,lectureId:lecture.id}} onClose={()=>setManualAdding(false)} onSaved={builder.refresh}/> : null}
        {pdfAdding ? (
          <PdfAuthorDialog
            target={{ ...builder.target, lectureId: lecture.id }}
            editable={builder.editable}
            onClose={() => setPdfAdding(false)}
            onSaved={builder.refresh}
          />
        ) : null}
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
          cascade={{ exercises: exerciseCount, documents: documentCount }}
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
              value: lecture.materials.filter((m) => m.type !== 'PDF_DOCUMENT').length,
            },
            { label: t('pdf.badge'), value: lecture.materials.filter((m) => m.type === 'PDF_DOCUMENT').length },
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
