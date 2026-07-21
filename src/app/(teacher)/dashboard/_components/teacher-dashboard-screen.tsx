'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useTeacherDashboard } from '../_hooks/use-teacher-dashboard';
import { DashboardCharts, DashboardLoading } from './dashboard-charts';
import { DashboardFilters } from './dashboard-filters';
import { DashboardSummary } from './dashboard-summary';
import { StudentsNeedingHelp } from './students-needing-help';

export function TeacherDashboardScreen() {
  const dashboard = useTeacherDashboard();

  return (
    <section className="flex flex-col gap-4 min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#16181D' }}>학습 분석</h2>
          <p style={{ fontSize: '12px', color: '#8A8F98', marginTop: 2 }}>과목·단계·챕터 단위로 학습 흐름을 확인하세요.</p>
        </div>
        <DashboardFilters
          subjectId={dashboard.subjectId}
          stageId={dashboard.stageId}
          chapterId={dashboard.chapterId}
          range={dashboard.range}
          subjects={dashboard.subjects}
          stages={dashboard.stages}
          chapters={dashboard.chapters}
          onSubjectChange={dashboard.selectSubject}
          onStageChange={dashboard.selectStage}
          onChapterChange={dashboard.selectChapter}
          onRangeChange={dashboard.selectRange}
        />
      </div>

      {dashboard.loading ? <DashboardLoading /> : dashboard.error ? (
        <div className="bg-white rounded-xl flex flex-col items-center justify-center gap-3 py-10" style={{ border: '1px solid #E5E8EC' }}>
          <AlertTriangle size={24} style={{ color: '#D97706' }} />
          <p style={{ fontSize: '13px', color: '#5A6270' }}>{dashboard.error}</p>
          <button onClick={dashboard.retry} className="flex items-center gap-1.5 px-3 rounded-lg" style={{ height: 34, border: '1px solid #E5E8EC', fontSize: '12px', fontWeight: 600, color: '#1B64DA' }}>
            <RefreshCw size={13} /> 다시 시도
          </button>
        </div>
      ) : dashboard.data ? (
        <>
          <DashboardSummary summary={dashboard.data.summary} />
          <DashboardCharts data={dashboard.data} />
          <StudentsNeedingHelp students={dashboard.data.studentsNeedingHelp} />
        </>
      ) : null}
    </section>
  );
}
