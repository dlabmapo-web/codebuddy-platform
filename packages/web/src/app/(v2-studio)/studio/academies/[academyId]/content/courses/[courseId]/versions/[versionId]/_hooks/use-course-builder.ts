'use client';

import type { ContentValidationIssue } from '@cove/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { orpc } from '@/lib/orpc';

import {
  countIssuesByModule,
  countLectures,
  swap,
  type CourseTree,
  type MoveDirection,
} from '../_lib/course-tree';

type BuilderTarget = {
  academyId: string;
  courseId: string;
  versionId: string;
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
  const { academyId, courseId, versionId } = target;
  const queryClient = useQueryClient();
  const router = useRouter();
  const queryKey = ['academy', academyId, 'course-version', versionId];
  const [moduleTitle, setModuleTitle] = useState('');
  const [lectureModuleId, setLectureModuleId] = useState<string | null>(null);
  const [lectureTitle, setLectureTitle] = useState('');
  const [issues, setIssues] = useState<ContentValidationIssue[] | null>(null);

  const treeQuery = useQuery({
    queryKey,
    queryFn: () => orpc.academyCourses.getDraftTree(target),
    initialData: initialTree,
    retry: false,
  });
  const tree = treeQuery.data;
  const editable = tree.version.status === 'DRAFT' && canEditCurriculum;
  const exerciseEditable =
    tree.version.status === 'DRAFT' && canEditExercises;

  function applyTree(next: CourseTree) {
    queryClient.setQueryData(queryKey, next);
    setIssues(null);
  }

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
    mutationFn: (input: { moduleId: string; title: string }) =>
      orpc.academyCourses.updateModule({ ...target, ...input }),
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
    mutationFn: (input: { lectureId: string; title: string }) =>
      orpc.academyCourses.updateLecture({ ...target, ...input }),
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
  const validateMutation = useMutation({
    mutationFn: () => orpc.academyCourses.validateVersion(target),
    onSuccess: (result) => setIssues(result.issues),
  });
  const publishMutation = useMutation({
    mutationFn: () => orpc.academyCourses.publishVersion(target),
    onSuccess: () => {
      router.push(`/studio/academies/${academyId}/content/courses`);
      router.refresh();
    },
  });
  const startNextDraftMutation = useMutation({
    mutationFn: () => orpc.academyCourses.createDraft({ academyId, courseId }),
    onSuccess: (course) => {
      if (course.draftVersion) {
        router.push(
          `/studio/academies/${academyId}/content/courses/${courseId}/versions/${course.draftVersion.id}`,
        );
      }
    },
  });

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
  ].find((mutation) => mutation.isError)?.error;

  const moduleIds = tree.modules.map((item) => item.id);

  return {
    tree,
    editable,
    exerciseEditable,
    moduleTitle,
    setModuleTitle,
    lectureModuleId,
    lectureTitle,
    setLectureTitle,
    issues,
    issuesByModule: countIssuesByModule(issues),
    lectureCount: countLectures(tree),
    structuralError,
    createModulePending: createModuleMutation.isPending,
    createLecturePending: createLectureMutation.isPending,
    validatePending: validateMutation.isPending,
    publishPending: publishMutation.isPending,
    publishError: publishMutation.error,
    startNextDraftPending: startNextDraftMutation.isPending,
    createModule: () => createModuleMutation.mutate(),
    startLecture: (moduleId: string) => {
      setLectureModuleId(moduleId);
      setLectureTitle('');
    },
    cancelLecture: () => setLectureModuleId(null),
    createLecture: () => createLectureMutation.mutate(),
    renameModule: (moduleId: string, title: string) =>
      updateModuleMutation.mutate({ moduleId, title }),
    deleteModule: (moduleId: string) => deleteModuleMutation.mutate(moduleId),
    moveModule: (index: number, direction: MoveDirection) =>
      reorderModulesMutation.mutate(
        swap(moduleIds, index, index + direction),
      ),
    renameLecture: (lectureId: string, title: string) =>
      updateLectureMutation.mutate({ lectureId, title }),
    deleteLecture: (lectureId: string) =>
      deleteLectureMutation.mutate(lectureId),
    moveLecture: (
      moduleId: string,
      lectureIds: string[],
      index: number,
      direction: MoveDirection,
    ) =>
      reorderLecturesMutation.mutate({
        moduleId,
        orderedLectureIds: swap(lectureIds, index, index + direction),
      }),
    deleteExercise: (lectureId: string, materialId: string) =>
      deleteExerciseMutation.mutate({ lectureId, materialId }),
    moveExercise: (
      lectureId: string,
      materialIds: string[],
      index: number,
      direction: MoveDirection,
    ) =>
      reorderExercisesMutation.mutate({
        lectureId,
        orderedMaterialIds: swap(materialIds, index, index + direction),
      }),
    validate: () => validateMutation.mutate(),
    publish: () => publishMutation.mutate(),
    startNextDraft: () => startNextDraftMutation.mutate(),
  };
}

export type CourseBuilderState = ReturnType<typeof useCourseBuilder>;
