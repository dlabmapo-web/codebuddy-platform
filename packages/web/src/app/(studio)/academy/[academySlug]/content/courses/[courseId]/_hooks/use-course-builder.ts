'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { orpc } from '@/lib/orpc';

import {
  countLectures,
  courseTreeQueryKey,
  reordered,
  type CourseTree,
} from '../_lib/course-tree';

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

  const setCourseVisibilityMutation = useMutation({
    mutationFn: (isVisible: boolean) =>
      orpc.academyCourses.setVisibility({ academyId, courseId, isVisible }),
    onSuccess: (course) => applyTree({ ...tree, course }),
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
    onSuccess: applyTree,
  });
  const setExerciseVisibilityMutation = useMutation({
    mutationFn: (input: {
      lectureId: string;
      materialId: string;
      isVisible: boolean;
    }) => orpc.academyCourses.setExerciseVisibility({ ...target, ...input }),
    onSuccess: applyTree,
  });
  const deleteLectureMutation = useMutation({
    mutationFn: (lectureId: string) =>
      orpc.academyCourses.deleteLecture({ ...target, lectureId }),
    onSuccess: applyTree,
  });
  const reorderLecturesMutation = useMutation({
    mutationFn: (input: { moduleId: string; orderedLectureIds: string[] }) =>
      orpc.academyCourses.reorderLectures({ ...target, ...input }),
    onSuccess: applyTree,
  });
  const deleteExerciseMutation = useMutation({
    mutationFn: (input: { lectureId: string; materialId: string }) =>
      orpc.academyCourses.deleteExercise({ ...target, ...input }),
    onSuccess: applyTree,
  });
  const reorderExercisesMutation = useMutation({
    mutationFn: (input: { lectureId: string; orderedMaterialIds: string[] }) =>
      orpc.academyCourses.reorderExercises({ ...target, ...input }),
    onSuccess: applyTree,
  });
  // Collapsed ids only, so anything newly added starts open.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const outlineIds = tree.modules.flatMap((courseModule) => [
    courseModule.id,
    ...courseModule.lectures.map((lecture) => lecture.id),
  ]);
  const anyExpanded = outlineIds.some((id) => !collapsed.has(id));

  const structuralError = [
    createModuleMutation,
    updateModuleMutation,
    deleteModuleMutation,
    reorderModulesMutation,
    createLectureMutation,
    updateLectureMutation,
    deleteLectureMutation,
    reorderLecturesMutation,
    deleteExerciseMutation,
    reorderExercisesMutation,
    setExerciseVisibilityMutation,
    setCourseVisibilityMutation,
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
    moveLecture: (moduleId: string, lectureId: string, toIndex: number) => {
      const parent = tree.modules.find((item) => item.id === moduleId);
      if (!parent) return;
      const ids = parent.lectures.map((item) => item.id);
      const from = ids.indexOf(lectureId);
      if (from < 0 || from === toIndex) return;
      reorderLecturesMutation.mutate({
        moduleId,
        orderedLectureIds: reordered(ids, from, toIndex),
      });
    },
    moveExercise: (lectureId: string, materialId: string, toIndex: number) => {
      const parent = tree.modules
        .flatMap((item) => item.lectures)
        .find((item) => item.id === lectureId);
      if (!parent) return;
      const ids = parent.materials.map((item) => item.id);
      const from = ids.indexOf(materialId);
      if (from < 0 || from === toIndex) return;
      reorderExercisesMutation.mutate({
        lectureId,
        orderedMaterialIds: reordered(ids, from, toIndex),
      });
    },
    movePending:
      reorderModulesMutation.isPending ||
      reorderLecturesMutation.isPending ||
      reorderExercisesMutation.isPending,
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
