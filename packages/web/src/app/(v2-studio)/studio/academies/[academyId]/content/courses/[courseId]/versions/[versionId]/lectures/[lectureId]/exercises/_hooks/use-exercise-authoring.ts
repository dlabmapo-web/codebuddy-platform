'use client';

import type { ExerciseAuthoringContext } from '@cove/shared';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { useLayoutTranslation } from '@/i18n';
import { toApiError } from '@/lib/api-errors';
import { orpc } from '@/lib/orpc';

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
  versionId: string;
  lectureId: string;
};

export function useExerciseAuthoring({
  target,
  initialContext,
  canEdit,
}: {
  target: AuthoringTarget;
  initialContext: ExerciseAuthoringContext;
  canEdit: boolean;
}) {
  const { t } = useLayoutTranslation('content');
  const router = useRouter();
  const initialDraft = React.useMemo(
    () => contextToDraft(initialContext),
    [initialContext],
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

  const dirty = serializeDraft(draft) !== savedSnapshot;
  const editable = canEdit && initialContext.version.status === 'DRAFT';
  const completeness = exerciseCompleteness(draft);
  const completeCount = completeness.filter((item) => item.complete).length;
  const saveReady = completeCount === completeness.length;

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
    onSuccess: (context) => {
      const material = context.material!;
      setSavedMaterialId(material.id);
      setExpectedUpdatedAt(material.programmingExercise!.updatedAt);
      setSavedSnapshot(serializeDraft(draft));
      if (!initialContext.material) {
        router.replace(
          `/studio/academies/${target.academyId}/content/courses/${target.courseId}/versions/${target.versionId}/lectures/${target.lectureId}/exercises/${material.id}`,
        );
      }
    },
  });

  function update<K extends keyof ExerciseDraft>(
    key: K,
    value: ExerciseDraft[K],
  ) {
    if (editable) setDraft((current) => ({ ...current, [key]: value }));
  }

  function leave() {
    if (dirty && !window.confirm(t('exercise.unsaved_confirm'))) return;
    router.push(
      `/studio/academies/${target.academyId}/content/courses/${target.courseId}/versions/${target.versionId}`,
    );
  }

  return {
    draft,
    update,
    editable,
    dirty,
    completeness,
    completeCount,
    saveReady,
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
