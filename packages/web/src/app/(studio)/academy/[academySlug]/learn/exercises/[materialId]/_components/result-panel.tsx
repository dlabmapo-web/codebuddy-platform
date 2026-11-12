'use client';
import { ProgrammingAssessmentResult } from '@/components/programming-review/assessment-result';
import { QuizFeedback } from '@/components/workspace/quiz-feedback';

import { useTranslation } from 'react-i18next';

import { useErrorText } from '@/i18n/client/use-error-text';
import { useLayoutTranslation } from '@/i18n';

import type { SubmissionState } from '../_hooks/use-submission';
import { hiddenResultCount, resultPresentation, showsScore } from '../_lib/scoring';
import { ResultHero } from './result-hero';
import { ResultMetrics } from './result-metrics';
import { TestResultList } from './test-result-list';

export function ResultPanel({
  submission,
  compiled = false,
}: {
  submission: SubmissionState;
  /** C/C++: shows a compile error and explains runtime errors. */
  compiled?: boolean;
}) {
  const { t } = useLayoutTranslation('learn');
  const { t: tc } = useTranslation('sample-check');
  const errorText = useErrorText();
  const { result, cells, submitting, error } = submission;

  if (!submitting && !result && !error) {
    return (
      <p className="px-4 py-3 text-[12.5px] text-[#8c8c8c]">
        {t('submit.empty')}
      </p>
    );
  }

  if (result?.status === 'RECORDED') return <div className="p-4"><ProgrammingAssessmentResult assessment={result.manualAssessment} dark/></div>;

  const presentation = resultPresentation(result, submitting, Boolean(error));
  const hiddenResults = hiddenResultCount(result);
  const suppressesResults =
    presentation === 'judge_error' || presentation === 'transport_error';

  return (
    <div className="space-y-4 px-4 py-4 sm:px-5">
      <ResultHero presentation={presentation} />

      {!suppressesResults && (submitting || (result && showsScore(result))) ? (
        <ResultMetrics
          cells={cells}
          presentation={presentation}
          result={result}
        />
      ) : null}

      {error ? (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-[12.5px] text-danger">
          {errorText(error)}
        </p>
      ) : null}

      {!suppressesResults && result?.compileFailed ? (
        <section className="space-y-2 rounded-xl border border-danger/25 bg-danger/[0.055] px-3 py-2.5" role="status">
          <h4 className="text-[12px] font-bold text-[#fb7185]">{tc('workspace.compile_error_title')}</h4>
          <p className="text-[11.5px] leading-relaxed text-[#aab3c2]">{tc('workspace.compile_error_result')}</p>
          {result.compileDiagnostics ? (
            <pre className="max-h-48 overflow-auto rounded-lg bg-[#171717] px-2.5 py-2 font-mono text-[11.5px] leading-[1.5] text-[#fda4af] ring-1 ring-inset ring-white/[0.06]">
              {result.compileDiagnostics}
            </pre>
          ) : null}
        </section>
      ) : null}
      {!suppressesResults && result?.quiz ? <QuizFeedback quiz={result.quiz} /> : null}
      {!suppressesResults && !result?.quiz ? (
        <TestResultList cells={cells} compiled={compiled} result={result} />
      ) : null}

      {hiddenResults > 0 ? (
        <p className="text-[11.5px] text-[#8c8c8c]">
          {t('submit.hidden_note', { count: hiddenResults })}
        </p>
      ) : null}
    </div>
  );
}
