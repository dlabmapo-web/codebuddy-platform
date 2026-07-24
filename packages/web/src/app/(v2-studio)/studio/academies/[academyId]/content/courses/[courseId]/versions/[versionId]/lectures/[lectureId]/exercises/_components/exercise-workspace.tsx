'use client';

import type { ExerciseAuthoringContext } from '@cove/shared';

import { useExerciseAuthoring } from '../_hooks/use-exercise-authoring';
import { AnswersEditor } from './answers-editor';
import { BasicInformation } from './basic-information';
import { ExerciseHeader } from './exercise-header';
import { ExerciseReadiness } from './exercise-readiness';
import { HintsEditor } from './hints-editor';
import { PreviewModal } from './preview-modal';
import { StarterCodeEditor } from './starter-code-editor';

export function ExerciseWorkspace({
  academyId,
  courseId,
  versionId,
  lectureId,
  initialContext,
  canEdit,
}: {
  academyId: string;
  courseId: string;
  versionId: string;
  lectureId: string;
  initialContext: ExerciseAuthoringContext;
  canEdit: boolean;
}) {
  const authoring = useExerciseAuthoring({
    target: { academyId, courseId, versionId, lectureId },
    initialContext,
    canEdit,
  });
  const { draft, editable, update } = authoring;

  return (
    <div className="space-y-5">
      <ExerciseHeader authoring={authoring} context={initialContext} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-start">
        <main className="min-w-0 space-y-5">
          <BasicInformation
            draft={draft}
            editable={editable}
            update={update}
          />
          <StarterCodeEditor
            editable={editable}
            onChange={(starterCode) => update('starterCode', starterCode)}
            value={draft.starterCode}
          />
          <AnswersEditor
            editable={editable}
            testCases={draft.testCases}
            update={(testCases) => update('testCases', testCases)}
          />
          <HintsEditor
            editable={editable}
            hints={draft.hints}
            update={(hints) => update('hints', hints)}
          />
        </main>

        <ExerciseReadiness
          completeCount={authoring.completeCount}
          completeness={authoring.completeness}
        />
      </div>

      {authoring.previewOpen ? (
        <PreviewModal draft={draft} onClose={authoring.closePreview} />
      ) : null}
    </div>
  );
}
