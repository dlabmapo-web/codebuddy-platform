'use client';

import { useRouter } from 'next/navigation';
import { HistoryFilters } from './history-filters';
import { HistorySummary } from './history-summary';
import { SubmissionList } from './submission-list';
import { useSubmissionHistory } from '../_hooks/use-submission-history';
import type { Submission } from '../_lib/types';

export function MyHistoryScreen() {
  const router = useRouter();
  const history = useSubmissionHistory();

  const openSubmission = (submission: Submission) => {
    router.push(`/problems/${submission.problem_id}?sid=${submission.id}`);
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#16181D' }}>내 풀이기록</h1>
        <p style={{ fontSize: '15px', color: '#5A6270', marginTop: 3 }}>지금까지 풀었던 문제들을 확인해보세요.</p>
      </div>

      <HistorySummary {...history.summary} />
      <HistoryFilters
        filter={history.filter}
        resultCount={history.filteredSubmissions.length}
        subjectId={history.subjectId}
        stageId={history.stageId}
        chapterId={history.chapterId}
        curriculumOptions={history.curriculumOptions}
        onFilterChange={history.selectFilter}
        onSubjectChange={history.selectSubject}
        onStageChange={history.selectStage}
        onChapterChange={history.selectChapter}
      />
      <SubmissionList
        loading={history.loading}
        submissions={history.filteredSubmissions}
        onOpenSubmission={openSubmission}
      />
    </div>
  );
}
