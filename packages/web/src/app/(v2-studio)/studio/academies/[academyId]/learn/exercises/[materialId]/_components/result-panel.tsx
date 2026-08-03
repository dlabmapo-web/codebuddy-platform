'use client';

import { useErrorText } from '@/i18n/client/use-error-text';
import { useLayoutTranslation } from '@/i18n';

import type { SubmissionState } from '../_hooks/use-submission';
import { hiddenResultCount, resultPresentation, showsScore } from '../_lib/scoring';
import { ResultHero } from './result-hero';
import { ResultMetrics } from './result-metrics';
import { TestResultList } from './test-result-list';

export function ResultPanel({ submission }: { submission: SubmissionState }) {
  const { t } = useLayoutTranslation('learn');
  const errorText = useErrorText();
  const { result, cells, submitting, error } = submission;

  if (!submitting && !result && !error) {
    return (
      <p className="px-4 py-3 text-[12.5px] text-[#8c8c8c]">
        {t('submit.empty')}
      </p>
    );
  }

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

      {!suppressesResults ? (
        <TestResultList cells={cells} result={result} />
      ) : null}

      {hiddenResults > 0 ? (
        <p className="text-[11.5px] text-[#8c8c8c]">
          {t('submit.hidden_note', { count: hiddenResults })}
        </p>
      ) : null}
    </div>
  );
}
