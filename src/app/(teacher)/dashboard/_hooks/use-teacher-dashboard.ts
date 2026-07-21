import { useEffect, useState } from 'react';
import type { DashboardRange, TeacherDashboardData } from '@/lib/types/teacherDashboard';

export function useTeacherDashboard() {
  const [range, setRange] = useState<DashboardRange>('30d');
  const [subjectId, setSubjectId] = useState('');
  const [stageId, setStageId] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [data, setData] = useState<TeacherDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    // Filter changes intentionally begin a new request lifecycle and hide stale data.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError('');

    const params = new URLSearchParams({ range });
    if (subjectId) params.set('subject_id', subjectId);
    if (stageId) params.set('stage_id', stageId);
    if (chapterId) params.set('chapter_id', chapterId);

    fetch(`/api/teacher/dashboard?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.error?.message ?? '대시보드 데이터를 불러오지 못했습니다.');
        return json as TeacherDashboardData;
      })
      .then((json) => setData(json))
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setError(caught instanceof Error ? caught.message : '대시보드 데이터를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [range, subjectId, stageId, chapterId, reloadKey]);

  const selectSubject = (value: string) => {
    setSubjectId(value);
    setStageId('');
    setChapterId('');
  };
  const selectStage = (value: string) => {
    setStageId(value);
    setChapterId('');
  };

  return {
    chapterId,
    chapters: data?.curriculum.chapters ?? [],
    data,
    error,
    loading,
    range,
    retry: () => setReloadKey((key) => key + 1),
    selectChapter: setChapterId,
    selectRange: setRange,
    selectStage,
    selectSubject,
    stageId,
    stages: data?.curriculum.stages ?? [],
    subjectId,
    subjects: data?.curriculum.subjects ?? [],
  };
}
