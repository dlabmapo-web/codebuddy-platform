'use client';

import type { ExerciseSolutionEntry } from "@cove/shared";

import { Code2, ListChecks } from 'lucide-react';
import * as React from 'react';
import { ExerciseImageProvider } from '@/components/studio/lesson-image-providers';
import { manualApi } from '@/lib/manual-api';
import { ChoiceSelector } from '@/components/studio/choice-selector';
import { useSearchParams } from 'next/navigation';
import { ReferencePdfPicker } from '@/components/pdf/reference-pdf-picker';
import { useTranslation } from 'react-i18next';
import { QuizEditor } from './quiz-editor';
import type { ExerciseAuthoringContext } from '@cove/shared';

import { useExerciseAuthoring } from '../_hooks/use-exercise-authoring';
import { SubmissionPolicyEditor } from './submission-policy-editor';
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
  initialSolutions,
}: {
  academyId: string;
  courseId: string;
  lectureId: string;
  initialContext: ExerciseAuthoringContext;
  canEdit: boolean;
  initialSolutions: ExerciseSolutionEntry[];
}) {
  const { t: tq } = useTranslation('quiz');
  const { t } = useTranslation(['content', 'pdf-practice']);
  const requireReferencePdf = useSearchParams().get('referencePdf') === 'required' && !initialContext.material;
  const authoring = useExerciseAuthoring({
    target: { academyId, courseId, lectureId },
    initialContext,
    canEdit,
    initialSolutions,
    requireReferencePdf,
  });
  const { draft, editable, update } = authoring;
  // Pictures uploaded in this session show from memory until the problem is saved.
  const [localImages] = React.useState(() => new Map<string, string>());
  React.useEffect(() => () => { for (const url of localImages.values()) URL.revokeObjectURL(url); }, [localImages]);
  const uploadImage = React.useCallback(async (file: File) => {
    const asset = await manualApi.upload({ academyId, courseId }, file);
    const src = `cove-asset:${asset.assetId}`;
    localImages.set(src, URL.createObjectURL(file));
    return src;
  }, [academyId, courseId, localImages]);

  const assessmentEditors = (<>
        {editable ? (
          <SolutionCodeEditor
            error={authoring.errorFor('solution')}
            language={draft.language}
            onChange={(solutions) => update('solutions', solutions)}
            value={draft.solutions}
          />
        ) : null}
        <HintsEditor
          editable={editable}
          hints={draft.hints}
          update={(hints) => update('hints', hints)}
        />
  </>);

  return (
    <ExerciseImageProvider academyId={academyId} materialId={authoring.savedMaterialId ?? undefined} preview local={localImages}>
    <div className="mx-auto max-w-6xl space-y-5">
      <ExerciseHeader authoring={authoring} context={initialContext} />

      <main className="min-w-0 space-y-5">
        <div className="max-w-sm space-y-2">
          <p className="text-sm font-semibold text-sub">{tq('type')}</p>
          {!editable || initialContext.material ? <div className="flex min-h-11 items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold">
            {draft.quiz ? <ListChecks aria-hidden className="size-4 text-brand" /> : <Code2 aria-hidden className="size-4 text-brand" />}
            {tq(draft.quiz ? 'single_answer' : 'programming')}
          </div> : <ChoiceSelector label={tq('type')} selectedId={draft.quiz ? 'quiz' : 'python'}
            list={[{ id: 'python', name: tq('programming') }, { id: 'quiz', name: tq('single_answer') }]}
            onSelect={(item) => update('quiz', item.id === 'quiz'
              ? { choices: Array.from({ length: 4 }, () => ({ id: crypto.randomUUID(), text: '' })), correctChoiceId: '', explanation: '' }
              : null)} />}
        </div>
        {!draft.quiz ? <ReferencePdfPicker target={{ academyId, courseId, lectureId }} value={draft.referencePdfMaterialId} disabled={!editable} onChange={id => update("referencePdfMaterialId", id)} onTitleAvailable={title => {
          if (!initialContext.material && !draft.title.trim()) update("title", title.slice(0, 200));
        }} /> : null}
        {requireReferencePdf && !draft.referencePdfMaterialId ? <p role="status" className="text-sm text-sub">{t("pdf-practice:required")}</p> : null}
        <BasicInformation
          authoring={authoring}
          draft={draft}
          editable={editable}
          onImageUpload={uploadImage}
          update={update}
        />
        {draft.quiz ? <QuizEditor value={draft.quiz} disabled={!editable} onChange={(quiz) => update('quiz', quiz)} /> : <>
        <StarterCodeEditor
          editable={editable}
          language={draft.language}
          onChange={(starterCode) => update('starterCode', starterCode)}
          value={draft.starterCode}
        />
        <SubmissionPolicyEditor draft={draft} editable={editable} onChange={policy => update('submissionPolicy', policy)} />
        {draft.submissionPolicy !== 'PRACTICE_ONLY' ? <div data-testid="grading-cases">        <AnswersEditor
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
</div> : null}
        <details className="rounded-xl border border-border bg-card p-5">
          <summary className="cursor-pointer text-sm font-semibold text-sub">{t('pdf-practice:solutions_hints')}</summary>
          <div className="mt-4 space-y-5">{assessmentEditors}</div>
        </details>
        </>}
        <ExerciseActions authoring={authoring} />
      </main>

      {authoring.previewOpen ? (
        <PreviewModal draft={draft} onClose={authoring.closePreview} />
      ) : null}
    </div>
    </ExerciseImageProvider>
  );
}
