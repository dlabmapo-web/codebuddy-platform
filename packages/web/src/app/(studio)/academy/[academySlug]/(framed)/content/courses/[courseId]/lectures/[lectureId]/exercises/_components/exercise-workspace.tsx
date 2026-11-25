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
import { AiLibraryPanel } from './ai-library-panel';
import { QuizEditor } from './quiz-editor';
import type { ExerciseAuthoringContext } from '@cove/shared';

import { useExerciseAuthoring } from '../_hooks/use-exercise-authoring';
import { exerciseCompleteness, withLanguage } from '../_lib/exercise-draft';
import { SubmissionPolicyEditor } from './submission-policy-editor';
import { AnswersEditor } from './answers-editor';
import { BasicInformation } from './basic-information';
import { ExerciseActions } from './exercise-actions';
import { ExerciseHeader } from './exercise-header';
import { HintsEditor } from './hints-editor';
import { PreviewModal } from './preview-modal';
import { StarterCodeEditor } from './starter-code-editor';
import { ProjectEditor } from './project-editor';
import { isCompiledLanguage, starterBundleFor, type CompiledLanguage, type ExerciseProject } from '@cove/shared';
import { projectTemplate } from '@/lib/workspace/file-bundle';
import { compiledStarterTemplates } from '@/lib/workspace/exercise-language';
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
  const { t: tf } = useTranslation('exercise-files');
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
            starterBundle={draft.sourceProject ? draft.starterCode : null}
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
          courseLanguage={initialContext.course.language}
          onLanguageChange={(language) => {
            const next = withLanguage(draft, language);
            update('language', next.language);
            update('starterCode', next.starterCode);
            update('grading', next.grading);
          }}
        />
        {draft.quiz ? <QuizEditor value={draft.quiz} disabled={!editable} onChange={(quiz) => update('quiz', quiz)} /> : <>
        {isCompiledLanguage(draft.language) ? (
          <FileModeSwitch
            editable={editable}
            multiple={Boolean(draft.sourceProject)}
            onChange={(multiple) => {
              if (multiple) {
                const project = projectFromStarter(draft.starterCode, draft.language as 'C' | 'CPP');
                update('sourceProject', project);
                update('starterCode', starterBundleFor(project));
              } else {
                if (!window.confirm(tf('to_single_confirm'))) return;
                const project = draft.sourceProject!;
                const main = project.files.find((file) => file.path === project.sources[0]) ?? project.files[0];
                update('sourceProject', null);
                update('starterCode', main?.content ?? '');
              }
            }}
          />
        ) : null}
        {draft.sourceProject && isCompiledLanguage(draft.language) ? (
          <ProjectEditor
            editable={editable}
            language={draft.language as 'C' | 'CPP'}
            project={draft.sourceProject}
            onChange={(project) => {
              update('sourceProject', project);
              update('starterCode', starterBundleFor(project));
            }}
          />
        ) : (
          <StarterCodeEditor
            editable={editable}
            language={draft.language}
            onChange={(starterCode) => update('starterCode', starterCode)}
            value={draft.starterCode}
          />
        )}
        <SubmissionPolicyEditor draft={draft} editable={editable} onChange={policy => update('submissionPolicy', policy)} onAssessmentChange={value => update('manualAssessment', value)} />
        {(draft.submissionPolicy ?? 'AUTOMATIC') === 'AUTOMATIC' ? <div data-testid="grading-cases">        <AnswersEditor
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
          {/* The answer is required whenever Submit grades automatically; only hints are always optional. */}
          <summary className="cursor-pointer text-sm font-semibold text-sub">{t(exerciseCompleteness(draft).find((row) => row.id === 'solution')?.optional ? 'pdf-practice:solutions_hints' : 'pdf-practice:solutions_hints_required')}</summary>
          <div className="mt-4 space-y-5">{assessmentEditors}</div>
        </details>
        {/* Its own section: nothing in it has to be filled in, so it stays out of the required box. */}
        {authoring.savedMaterialId ? (
          <AiLibraryPanel academyId={academyId} courseId={courseId} editable={editable} materialId={authoring.savedMaterialId} />
        ) : null}
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

/**
 * A problem's own code as a project's start: an untouched template becomes
 * Elice's three-file example, anything an author wrote becomes `main.c` (or
 * `main.cpp`), compiled and open.
 */
function projectFromStarter(starterCode: string, language: CompiledLanguage): ExerciseProject {
  if (!starterCode.trim() || starterCode === compiledStarterTemplates[language]) return projectTemplate(language);
  const path = language === 'C' ? 'main.c' : 'main.cpp';
  return {
    version: 1,
    files: [{ path, content: starterCode, readOnly: false, hidden: false, openByDefault: true }],
    sources: [path],
    includeLearnerSources: false,
    fileTree: 'CLOSED',
  };
}

function FileModeSwitch({ multiple, editable, onChange }: { multiple: boolean; editable: boolean; onChange: (multiple: boolean) => void }) {
  const { t } = useTranslation('exercise-files');
  return (
    <div role="radiogroup" aria-label={t('title')} className="inline-flex rounded-lg border border-border bg-card p-1 text-sm">
      {[false, true].map((value) => (
        <button
          key={String(value)}
          type="button"
          role="radio"
          aria-checked={multiple === value}
          disabled={!editable}
          onClick={() => multiple !== value && onChange(value)}
          className={`rounded-md px-3 py-1.5 font-semibold ${multiple === value ? 'bg-brand text-on-brand' : 'text-sub hover:text-text'}`}
        >
          {t(value ? 'multiple' : 'single')}
        </button>
      ))}
    </div>
  );
}
