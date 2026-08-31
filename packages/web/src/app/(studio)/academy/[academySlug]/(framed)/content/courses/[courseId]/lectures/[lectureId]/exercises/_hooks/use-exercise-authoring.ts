'use client';

import { routes } from '@/lib/routes';

import { useAcademySlug } from '@/components/studio/academy-route-provider';

import type { ExerciseAuthoringContext } from '@cove/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { useLayoutTranslation } from '@/i18n';
import { toApiError } from '@/lib/api-errors';
import { orpc } from '@/lib/orpc';

import { courseTreeQueryKey } from '../../../../_lib/course-tree';
import {
  contextToDraft,
  draftToPayload,
  exerciseCompleteness,
  serializeDraft,
  type ExerciseDraft,
} from '../_lib/exercise-draft';

type AuthoringTarget = {
  academyId: string;
  courseId: string;
  lectureId: string;
};

export function useExerciseAuthoring({
  target,
  initialContext,
  canEdit,
  initialSolutionCode,
}: {
  target: AuthoringTarget;
  initialContext: ExerciseAuthoringContext;
  canEdit: boolean;
  initialSolutionCode: string;
}) {
  const academySlug = useAcademySlug();
  const { t } = useLayoutTranslation('content');
  const router = useRouter();
  const queryClient = useQueryClient();
  const initialDraft = React.useMemo(
    () => contextToDraft(initialContext, initialSolutionCode),
    [initialContext, initialSolutionCode],
  );
  const [draft, setDraft] = React.useState(initialDraft);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [savedMaterialId, setSavedMaterialId] = React.useState(
    initialContext.material?.id ?? null,
  );
  const [expectedUpdatedAt, setExpectedUpdatedAt] = React.useState(
    initialContext.material?.programmingExercise?.updatedAt ?? null,
  );
  const [savedSnapshot, setSavedSnapshot] = React.useState(() =>
    serializeDraft(initialDraft),
  );

  // A field only shows its error once the author has actually touched it, so a
  // fresh form isn't covered in red before anything has been typed.
  const [touched, setTouched] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const dirty = serializeDraft(draft) !== savedSnapshot;
  const editable = canEdit;
  const completeness = exerciseCompleteness(draft);
  const completeCount = completeness.filter((item) => item.complete).length;
  const saveReady = completeCount === completeness.length;
  const missing = completeness
    .filter((item) => !item.complete)
    .map((item) => item.id);

  const builderPath = `${routes.academy(academySlug)}/content/courses/${target.courseId}`;

  React.useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = draftToPayload(draft);
      if (savedMaterialId && expectedUpdatedAt) {
        return orpc.academyCourses.updateExercise({
          ...target,
          materialId: savedMaterialId,
          expectedUpdatedAt,
          ...payload,
        });
      }
      return orpc.academyCourses.createExercise({ ...target, ...payload });
    },
    onSuccess: async (context) => {
      const material = context.material!;
      setSavedMaterialId(material.id);
      setExpectedUpdatedAt(material.programmingExercise!.updatedAt);
      setSavedSnapshot(serializeDraft(draft));

      /*
       * The builder caches its tree, so without this the curriculum would show
       * the pre-save title and badges until the cache went stale on its own.
       * `refresh` re-runs the server component that seeds that cache.
       */
      await queryClient.invalidateQueries({
        queryKey: courseTreeQueryKey(target.academyId, target.courseId),
      });
      router.push(builderPath);
      router.refresh();
    },
  });

  function update<K extends keyof ExerciseDraft>(
    key: K,
    value: ExerciseDraft[K],
  ) {
    if (!editable) return;
    setTouched((current) => new Set(current).add(key));
    setDraft((current) => ({ ...current, [key]: value }));
  }

  /** Errors surface per field, next to the input that needs fixing. */
  function errorFor(field: 'title' | 'difficulty' | 'description' | 'solution' | 'test') {
    if (!editable) return null;
    const key = field === 'test' ? 'testCases' : field === 'solution' ? 'solutionCode' : field;
    if (!touched.has(key)) return null;
    return missing.includes(field) ? t(`exercise.error.${field}`) : null;
  }

  function leave() {
    if (dirty && !window.confirm(t('exercise.unsaved_confirm'))) return;
    router.push(builderPath);
  }

  return {
    draft,
    update,
    editable,
    dirty,
    completeness,
    completeCount,
    saveReady,
    missing,
    errorFor,
    isNew: !initialContext.material,
    savedMaterialId,
    previewOpen,
    openPreview: () => setPreviewOpen(true),
    closePreview: () => setPreviewOpen(false),
    leave,
    save: () => saveMutation.mutate(),
    savePending: saveMutation.isPending,
    saveError: saveMutation.error,
    saveConflict:
      saveMutation.isError &&
      toApiError(saveMutation.error).code === 'CONTENT_EDIT_CONFLICT',
  };
}

export type ExerciseAuthoring = ReturnType<typeof useExerciseAuthoring>;
