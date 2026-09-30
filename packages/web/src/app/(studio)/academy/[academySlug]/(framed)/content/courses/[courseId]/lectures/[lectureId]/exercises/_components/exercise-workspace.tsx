'use client';

import { useTranslation } from 'react-i18next';
import { QuizEditor } from './quiz-editor';
import type { ExerciseAuthoringContext } from '@cove/shared';

import { useExerciseAuthoring } from '../_hooks/use-exercise-authoring';
import { AnswersEditor } from './answers-editor';
import { BasicInformation } from './basic-information';
import { ExerciseActions } from './exercise-actions';
import { ExerciseHeader } from './exercise-header';
import { HintsEditor } from './hints-editor';
import { PreviewModal } from './preview-modal';
import { StarterCodeEditor } from './starter-code-editor';
import { SolutionCodeEditor } from './solution-code-editor';

export function ExerciseWorkspace({
  academyId,
  courseId,
  lectureId,
  initialContext,
  canEdit,
  initialSolutionCode,
}: {
  academyId: string;
  courseId: string;
  lectureId: string;
  initialContext: ExerciseAuthoringContext;
  canEdit: boolean;
  initialSolutionCode: string;
}) {
  const { t: tq } = useTranslation('quiz');
  const authoring = useExerciseAuthoring({
    target: { academyId, courseId, lectureId },
    initialContext,
    canEdit,
    initialSolutionCode,
  });
  const { draft, editable, update } = authoring;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <ExerciseHeader authoring={authoring} context={initialContext} />

      <main className="min-w-0 space-y-5">
        <label className="block space-y-2">{tq('type')}
          <select className="block rounded-lg border border-border bg-card p-3" value={draft.quiz ? 'quiz' : 'python'}
            disabled={!editable || Boolean(initialContext.material)}
            onChange={(event) => update('quiz', event.target.value === 'quiz'
              ? { choices: Array.from({ length: 4 }, () => ({ id: crypto.randomUUID(), text: '' })), correctChoiceId: '', explanation: '' }
              : null)}>
            <option value="python">{tq('programming')}</option><option value="quiz">{tq('single_answer')}</option>
          </select>
        </label>
        <BasicInformation
          authoring={authoring}
          draft={draft}
          editable={editable}
          update={update}
        />
        {draft.quiz ? <QuizEditor value={draft.quiz} disabled={!editable} onChange={(quiz) => update('quiz', quiz)} /> : <>
        <StarterCodeEditor
          editable={editable}
          onChange={(starterCode) => update('starterCode', starterCode)}
          value={draft.starterCode}
        />
        {editable ? (
          <SolutionCodeEditor
            error={authoring.errorFor('solution')}
            onChange={(solutionCode) => update('solutionCode', solutionCode)}
            value={draft.solutionCode}
          />
        ) : null}
        <AnswersEditor
          editable={editable}
          error={authoring.errorFor('test')}
          grading={draft.grading}
          gradingIssues={authoring.gradingIssues}
          testCases={draft.testCases}
          update={(testCases) => update('testCases', testCases)}
          updateGrading={(grading, testCases) => {
            update('grading', grading);
            update('testCases', testCases);
          }}
        />
        <HintsEditor
          editable={editable}
          hints={draft.hints}
          update={(hints) => update('hints', hints)}
        />
        </>}
        <ExerciseActions authoring={authoring} />
      </main>

      {authoring.previewOpen ? (
        <PreviewModal draft={draft} onClose={authoring.closePreview} />
      ) : null}
    </div>
  );
}
