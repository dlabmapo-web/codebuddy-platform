'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { toApiError } from '@/lib/api-errors';
import { orpc } from '@/lib/orpc';

import {
  countLectures,
  courseTreeQueryKey,
  locateItem,
  moduleOfParent,
  movedTree,
  renumbered,
  reordered,
  withVisibility,
  type CourseTree,
  type VisibilityTarget,
  type MoveKind,
  type MoveLocation,
} from '../_lib/course-tree';

/** A move the author can still undo from the toast. */
export type LastMove = {
  kind: MoveKind;
  itemId: string;
  title: string;
  from: MoveLocation;
  to: MoveLocation;
};

/** What the toast under the builder is saying, if anything. */
export type MoveNotice =
  | { id: number; kind: 'moved'; move: LastMove; destination: string }
  | { id: number; kind: 'undone' }
  | { id: number; kind: 'undo_unavailable' }
  | { id: number; kind: 'undo_failed'; error: unknown }
  | { id: number; kind: 'move_failed'; error: unknown };

/**
 * Codes meaning the tree the author chose from is no longer the course: the
 * item or a destination moved or vanished in another session.
 */
const staleMoveCodes = new Set(['CONTENT_MOVE_STALE', 'CONTENT_PARENT_MISMATCH']);

type BuilderTarget = {
  academyId: string;
  courseId: string;
};

export function useCourseBuilder({
  target,
  initialTree,
  canEditCurriculum,
  canEditExercises,
}: {
  target: BuilderTarget;
  initialTree: CourseTree;
  canEditCurriculum: boolean;
  canEditExercises: boolean;
}) {
  const { academyId, courseId } = target;
  const queryClient = useQueryClient();
  const queryKey = courseTreeQueryKey(academyId, courseId);
  const [moduleTitle, setModuleTitle] = useState('');
  const [lectureModuleId, setLectureModuleId] = useState<string | null>(null);
  const [lectureTitle, setLectureTitle] = useState('');

  const treeQuery = useQuery({
    queryKey,
    queryFn: () => orpc.academyCourses.getTree(target),
    initialData: initialTree,
    retry: false,
  });
  const tree = treeQuery.data;
  const editable = canEditCurriculum;
  const exerciseEditable = canEditExercises;

  function applyTree(next: CourseTree) {
    queryClient.setQueryData(queryKey, next);
  }

  /**
   * Show a visibility change before the server confirms it.
   *
   * The write reloads the whole course, which is most of a second against a
   * remote database; the flag itself is one bit the page already knows. The
   * previous tree is kept so a refused write puts the eye back.
   */
  async function flipOptimistically(
    target: VisibilityTarget,
    id: string,
    isVisible: boolean | undefined,
  ) {
    if (isVisible === undefined) return { previous: undefined };
    await queryClient.cancelQueries({ queryKey });
    const previous = queryClient.getQueryData<CourseTree>(queryKey);
    if (previous) {
      queryClient.setQueryData(queryKey, withVisibility(previous, target, id, isVisible));
    }
    return { previous };
  }

  function restoreTree(context: { previous?: CourseTree } | undefined) {
    if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
  }

  const setCourseVisibilityMutation = useMutation({
    mutationFn: (isVisible: boolean) =>
      orpc.academyCourses.setVisibility({ academyId, courseId, isVisible }),
    onMutate: (isVisible) => flipOptimistically('course', courseId, isVisible),
    onError: (_error, _input, context) => restoreTree(context),
    onSuccess: (course) => {
      const current = queryClient.getQueryData<CourseTree>(queryKey) ?? tree;
      applyTree({ ...current, course });
    },
  });

  /**
   * Every module, lecture and problem at once.
   *
   * The action that makes a course arriving complete — copied from the library,
   * or filled by the workbook importer — teachable. Doing it a row at a time is
   * several hundred requests, which is how courses end up published and empty.
   */
  const setContentVisibilityMutation = useMutation({
    mutationFn: (isVisible: boolean) =>
      orpc.academyCourses.setContentVisibility({
        academyId,
        courseId,
        isVisible,
      }),
    onSuccess: applyTree,
  });

  const createModuleMutation = useMutation({
    mutationFn: () =>
      orpc.academyCourses.createModule({
        ...target,
        title: moduleTitle,
        description: '',
      }),
    onSuccess: (next) => {
      applyTree(next);
      setModuleTitle('');
    },
  });
  const updateModuleMutation = useMutation({
    mutationFn: (input: {
      moduleId: string;
      title?: string;
      isVisible?: boolean;
    }) => orpc.academyCourses.updateModule({ ...target, ...input }),
    onMutate: (input) => flipOptimistically('module', input.moduleId, input.isVisible),
    onError: (_error, _input, context) => restoreTree(context),
    onSuccess: applyTree,
  });
  const deleteModuleMutation = useMutation({
    mutationFn: (moduleId: string) =>
      orpc.academyCourses.deleteModule({ ...target, moduleId }),
    onSuccess: applyTree,
  });
  const reorderModulesMutation = useMutation({
    mutationFn: (orderedModuleIds: string[]) =>
      orpc.academyCourses.reorderModules({ ...target, orderedModuleIds }),
    // Reordered on screen at once; a dragged chapter must not spring back
    // to where it was for the length of a round trip.
    onMutate: async (orderedModuleIds) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<CourseTree>(queryKey);
      if (previous) {
        const byId = new Map(previous.modules.map((item) => [item.id, item]));
        const modules = orderedModuleIds.flatMap((id) => byId.get(id) ?? []);
        if (modules.length === previous.modules.length) {
          queryClient.setQueryData(queryKey, renumbered({ ...previous, modules }));
        }
      }
      return { previous };
    },
    onError: (_error, _input, context) => restoreTree(context),
    onSuccess: applyTree,
  });
  const createLectureMutation = useMutation({
    mutationFn: () =>
      orpc.academyCourses.createLecture({
        ...target,
        moduleId: lectureModuleId!,
        title: lectureTitle,
        description: '',
      }),
    onSuccess: (next) => {
      applyTree(next);
      setLectureModuleId(null);
      setLectureTitle('');
    },
  });
  const updateLectureMutation = useMutation({
    mutationFn: (input: {
      lectureId: string;
      title?: string;
      isVisible?: boolean;
    }) => orpc.academyCourses.updateLecture({ ...target, ...input }),
    onMutate: (input) => flipOptimistically('lecture', input.lectureId, input.isVisible),
    onError: (_error, _input, context) => restoreTree(context),
    onSuccess: applyTree,
  });
  const setExerciseVisibilityMutation = useMutation({
    mutationFn: (input: {
      lectureId: string;
      materialId: string;
      isVisible: boolean;
    }) => orpc.academyCourses.setExerciseVisibility({ ...target, ...input }),
    onMutate: (input) =>
      flipOptimistically('exercise', input.materialId, input.isVisible),
    onError: (_error, _input, context) => restoreTree(context),
    onSuccess: applyTree,
  });
  const deleteLectureMutation = useMutation({
    mutationFn: (lectureId: string) =>
      orpc.academyCourses.deleteLecture({ ...target, lectureId }),
    onSuccess: applyTree,
  });
  const moveLectureMutation = useMutation({
    mutationFn: (input: {
      lectureId: string;
      fromModuleId: string;
      toModuleId: string;
      toIndex: number;
    }) => orpc.academyCourses.moveLecture({ ...target, ...input }),
    onSuccess: applyTree,
  });
  const deleteExerciseMutation = useMutation({
    mutationFn: (input: { lectureId: string; materialId: string }) =>
      orpc.academyCourses.deleteExercise({ ...target, ...input }),
    onSuccess: applyTree,
  });
  const moveExerciseMutation = useMutation({
    mutationFn: (input: {
      materialId: string;
      fromLectureId: string;
      toLectureId: string;
      toIndex: number;
    }) => orpc.academyCourses.moveExercise({ ...target, ...input }),
    onSuccess: applyTree,
  });
  const [notice, setNotice] = useState<MoveNotice | null>(null);
  const [revealId, setRevealId] = useState<string | null>(null);
  const movePending =
    reorderModulesMutation.isPending ||
    moveLectureMutation.isPending ||
    moveExerciseMutation.isPending;
  // Collapsed ids only, so anything newly added starts open.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const outlineIds = tree.modules.flatMap((courseModule) => [
    courseModule.id,
    ...courseModule.lectures.map((lecture) => lecture.id),
  ]);
  const anyExpanded = outlineIds.some((id) => !collapsed.has(id));

  /**
   * One move, from wherever the item is now to `to`.
   *
   * Throws on failure so the dialog can stay open with the author's choice
   * intact. A stale tree is refetched on the way out, so the choice they make
   * next is made against the course as it now is.
   */
  async function performMove(kind: MoveKind, itemId: string, to: MoveLocation) {
    const from = locateItem(tree, kind, itemId);
    if (!from) throw new Error('The item is no longer in this course.');
    // Shown in its new place at once, from either the dialog or a drop. The
    // server's tree replaces this when it answers; a refusal puts it back.
    await queryClient.cancelQueries({ queryKey });
    const previous = queryClient.getQueryData<CourseTree>(queryKey);
    if (previous) {
      queryClient.setQueryData(queryKey, renumbered(movedTree(previous, kind, itemId, to)));
    }
    try {
      if (kind === 'lecture') {
        await moveLectureMutation.mutateAsync({
          lectureId: itemId,
          fromModuleId: from.parentId,
          toModuleId: to.parentId,
          toIndex: to.index,
        });
      } else {
        await moveExerciseMutation.mutateAsync({
          materialId: itemId,
          fromLectureId: from.parentId,
          toLectureId: to.parentId,
          toIndex: to.index,
        });
      }
    } catch (error) {
      restoreTree({ previous });
      const code = toApiError(error).code;
      if (code && staleMoveCodes.has(code)) void treeQuery.refetch();
      throw error;
    }

    // The destination is opened wherever it was collapsed, so the row the
    // author is about to be shown is actually on the page.
    const destinationModule = moduleOfParent(tree, kind, to.parentId);
    setCollapsed((current) => {
      const next = new Set(current);
      if (destinationModule) next.delete(destinationModule.id);
      next.delete(to.parentId);
      return next;
    });
    setRevealId(itemId);
    return from;
  }

  function destinationLabel(kind: MoveKind, parentId: string) {
    const courseModule = moduleOfParent(tree, kind, parentId);
    if (!courseModule) return '';
    if (kind === 'lecture') return courseModule.title;
    const lecture = courseModule.lectures.find((item) => item.id === parentId);
    return lecture ? `${courseModule.title} › ${lecture.title}` : courseModule.title;
  }

  const structuralError = [
    createModuleMutation,
    updateModuleMutation,
    deleteModuleMutation,
    reorderModulesMutation,
    createLectureMutation,
    updateLectureMutation,
    deleteLectureMutation,
    deleteExerciseMutation,
    setExerciseVisibilityMutation,
    setCourseVisibilityMutation,
    setContentVisibilityMutation,
  ].find((mutation) => mutation.isError)?.error;

  return {
    tree,
    editable,
    exerciseEditable,
    moduleTitle,
    setModuleTitle,
    lectureModuleId,
    lectureTitle,
    setLectureTitle,
    lectureCount: countLectures(tree),
    structuralError,
    isCollapsed: (id: string) => collapsed.has(id),
    toggleCollapsed: (id: string) =>
      setCollapsed((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    anyExpanded,
    toggleAll: () =>
      setCollapsed(anyExpanded ? new Set(outlineIds) : new Set()),
    createModulePending: createModuleMutation.isPending,
    createLecturePending: createLectureMutation.isPending,
    createModule: () => createModuleMutation.mutate(),
    startLecture: (moduleId: string) => {
      setLectureModuleId(moduleId);
      setLectureTitle('');
    },
    cancelLecture: () => setLectureModuleId(null),
    createLecture: () => createLectureMutation.mutate(),
    renameModule: (moduleId: string, title: string) =>
      updateModuleMutation.mutate({ moduleId, title }),
    setCourseVisible: (isVisible: boolean) =>
      setCourseVisibilityMutation.mutate(isVisible),
    setContentVisible: (isVisible: boolean) =>
      setContentVisibilityMutation.mutate(isVisible),
    setContentVisiblePending: setContentVisibilityMutation.isPending,
    /**
     * Whether this row's visibility toggle is the one mid-request.
     *
     * Per row rather than one flag: flipping a lecture must not put a spinner
     * in every toggle on the page, only in the one that was pressed.
     */
    visibilityPending: (id: string) =>
      (setCourseVisibilityMutation.isPending && id === tree.course.id) ||
      (updateModuleMutation.isPending &&
        updateModuleMutation.variables?.moduleId === id &&
        updateModuleMutation.variables.isVisible !== undefined) ||
      (updateLectureMutation.isPending &&
        updateLectureMutation.variables?.lectureId === id &&
        updateLectureMutation.variables.isVisible !== undefined) ||
      (setExerciseVisibilityMutation.isPending &&
        setExerciseVisibilityMutation.variables?.materialId === id),
    setModuleVisible: (moduleId: string, isVisible: boolean) =>
      updateModuleMutation.mutate({ moduleId, isVisible }),
    deleteModule: (moduleId: string) => deleteModuleMutation.mutate(moduleId),
    renameLecture: (lectureId: string, title: string) =>
      updateLectureMutation.mutate({ lectureId, title }),
    setLectureVisible: (lectureId: string, isVisible: boolean) =>
      updateLectureMutation.mutate({ lectureId, isVisible }),
    deleteLecture: (lectureId: string) =>
      deleteLectureMutation.mutate(lectureId),
    deleteExercise: (lectureId: string, materialId: string) =>
      deleteExerciseMutation.mutate({ lectureId, materialId }),
    /*
     * The three moves. Each rebuilds the whole sibling ordering from the tree
     * already in hand, because the endpoint verifies the set it receives
     * matches the parent's children exactly. Callers report a destination
     * index and nothing else; the arithmetic lives here rather than in a row.
     */
    moveModule: (moduleId: string, toIndex: number) => {
      const ids = tree.modules.map((item) => item.id);
      const from = ids.indexOf(moduleId);
      if (from < 0 || from === toIndex) return;
      reorderModulesMutation.mutate(reordered(ids, from, toIndex));
    },
    /**
     * Move a lecture to any chapter, or a problem to any lecture, of this
     * course. Resolves once the server has the new tree; rejects with the
     * API error otherwise.
     */
    move: async (kind: MoveKind, itemId: string, to: MoveLocation) => {
      const from = await performMove(kind, itemId, to);
      setNotice({
        id: Date.now(),
        kind: 'moved',
        destination: destinationLabel(kind, to.parentId),
        move: { kind, itemId, title: from.title, from, to },
      });
    },
    /**
     * A move from a drop. Nothing waits on it, so a failure is reported in the
     * toast rather than thrown to a dialog that does not exist.
     */
    moveFromDrag: async (kind: MoveKind, itemId: string, to: MoveLocation) => {
      try {
        const from = await performMove(kind, itemId, to);
        setNotice({
          id: Date.now(),
          kind: 'moved',
          destination: destinationLabel(kind, to.parentId),
          move: { kind, itemId, title: from.title, from, to },
        });
      } catch (error) {
        setNotice({ id: Date.now(), kind: 'move_failed', error });
      }
    },
    movePending,
    notice,
    dismissNotice: () => setNotice(null),
    /**
     * Put a move back where it came from.
     *
     * Refused when the tree no longer holds the item, or no longer holds its
     * original parent: a lecture deleted in the meantime is not somewhere
     * anything can return to.
     */
    undoMove: async (move: LastMove) => {
      const originExists =
        move.kind === 'lecture'
          ? tree.modules.some((item) => item.id === move.from.parentId)
          : tree.modules.some((item) =>
              item.lectures.some((lecture) => lecture.id === move.from.parentId),
            );
      if (!originExists || !locateItem(tree, move.kind, move.itemId)) {
        setNotice({ id: Date.now(), kind: 'undo_unavailable' });
        return;
      }
      try {
        await performMove(move.kind, move.itemId, move.from);
        setNotice({ id: Date.now(), kind: 'undone' });
      } catch (error) {
        setNotice({ id: Date.now(), kind: 'undo_failed', error });
      }
    },
    revealId,
    clearReveal: () => setRevealId(null),
    setExerciseVisible: (
      lectureId: string,
      materialId: string,
      isVisible: boolean,
    ) =>
      setExerciseVisibilityMutation.mutate({
        lectureId,
        materialId,
        isVisible,
      }),
  };
}

export type CourseBuilderState = ReturnType<typeof useCourseBuilder>;
