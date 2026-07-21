import { useEffect, useMemo, useState } from 'react';
import {
  curriculumOptionsOf,
  filterSubmissions,
  summarizeSubmissions,
} from '../_lib/submissions';
import type { Submission, SubmissionFilter } from '../_lib/types';

export function useSubmissionHistory() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<SubmissionFilter>('all');
  const [subjectId, setSubjectId] = useState('');
  const [stageId, setStageId] = useState('');
  const [chapterId, setChapterId] = useState('');

  useEffect(() => {
    fetch('/api/submissions')
      .then((response) => response.json())
      .then((json) => setSubmissions(json.submissions ?? []))
      .finally(() => setLoading(false));
  }, []);

  const curriculumOptions = useMemo(
    () => curriculumOptionsOf(submissions, subjectId, stageId),
    [submissions, subjectId, stageId],
  );

  const filteredSubmissions = useMemo(
    () => filterSubmissions(submissions, filter, subjectId, stageId, chapterId),
    [submissions, filter, subjectId, stageId, chapterId],
  );

  const summary = useMemo(() => summarizeSubmissions(submissions), [submissions]);

  const selectSubject = (nextSubjectId: string) => {
    setSubjectId(nextSubjectId);
    setStageId('');
    setChapterId('');
  };

  const selectStage = (nextStageId: string) => {
    setStageId(nextStageId);
    setChapterId('');
  };

  return {
    chapterId,
    curriculumOptions,
    filter,
    filteredSubmissions,
    loading,
    selectChapter: setChapterId,
    selectFilter: setFilter,
    selectStage,
    selectSubject,
    stageId,
    subjectId,
    summary,
  };
}
